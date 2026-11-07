import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus, RegistrationStatus, ErrorCode } from '@csi/shared';

describe('RBAC & Audit Trail Subsystem (E2E) (ARCH-05, ARCH-06, SEC-23)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let memberUserId: string;
  let memberSessionCookie: string;
  let adminUserId: string;
  let adminSessionCookie: string;
  let adminRoleId: string;
  let memberRoleId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // Fail-closed verification (U1 / Finding F-01): verify live target is csi_gcet_test before any deletion
    await assertStrictTestDatabase(prisma);

    // Clean tables in reverse dependency order
    await prisma.termRollover.deleteMany();
    await prisma.termSnapshot.deleteMany();
    await prisma.academicTerm.deleteMany();
    await prisma.committeeAsset.deleteMany();
    await prisma.checklistRun.deleteMany();
    await prisma.checklistItem.deleteMany();
    await prisma.checklist.deleteMany();
    await prisma.task.deleteMany();
    await prisma.passport.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.certificateBatch.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.eventGuest.deleteMany();
    await prisma.event.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.session.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.user.deleteMany();

    // Ensure system roles exist
    const memberRole = await prisma.role.upsert({
      where: { code: RoleCode.MEMBER },
      update: {},
      create: {
        code: RoleCode.MEMBER,
        name: 'Member',
        description: 'Standard CSI member',
      },
    });
    memberRoleId = memberRole.id;

    const adminRole = await prisma.role.upsert({
      where: { code: RoleCode.ADMIN },
      update: {},
      create: {
        code: RoleCode.ADMIN,
        name: 'Admin',
        description: 'Administrator with full system privileges',
      },
    });
    adminRoleId = adminRole.id;

    const pwHash = await hashPassword('StrongPassword123!');

    // 1. Create standard member user
    const memberUser = await prisma.user.create({
      data: {
        email: 'member.e2e@gcet.ac.in',
        name: 'Member E2E',
        passwordHash: pwHash,
        status: UserStatus.ACTIVE,
      },
    });
    memberUserId = memberUser.id;

    await prisma.roleAssignment.create({
      data: {
        userId: memberUserId,
        roleId: memberRoleId,
      },
    });

    const memberToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: memberUserId,
        tokenHash: hashToken(memberToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    memberSessionCookie = `csi_session=${memberToken}`;

    // 2. Create administrator user
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin.e2e@gcet.ac.in',
        name: 'Admin E2E',
        passwordHash: pwHash,
        status: UserStatus.ACTIVE,
      },
    });
    adminUserId = adminUser.id;

    await prisma.roleAssignment.create({
      data: {
        userId: adminUserId,
        roleId: adminRoleId,
      },
    });

    const adminToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: adminUserId,
        tokenHash: hashToken(adminToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    adminSessionCookie = `csi_session=${adminToken}`;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. SEC-23: Database Trigger Immutability on audit_log', () => {
    it('strictly forbids UPDATE operations at Postgres trigger level (Error P0001)', async () => {
      // First ensure at least one audit record exists
      await prisma.auditLog.create({
        data: {
          action: 'E2E_IMMUTABILITY_TEST',
          targetType: 'test',
        },
      });

      await expect(
        prisma.$executeRawUnsafe(`UPDATE "audit_log" SET "action" = 'TAMPERED' WHERE "action" = 'E2E_IMMUTABILITY_TEST'`),
      ).rejects.toThrow();
    });

    it('strictly forbids DELETE operations at Postgres trigger level (Error P0001)', async () => {
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "audit_log" WHERE "action" = 'E2E_IMMUTABILITY_TEST'`),
      ).rejects.toThrow();
    });
  });

  describe('2. ARCH-05: Deny-by-Default & Permission Enforcement', () => {
    it('rejects unauthenticated requests to GET /api/audit-logs with 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer()).get('/api/audit-logs').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects member without AUDIT_VIEW permission with 403 FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Cookie', [memberSessionCookie])
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Missing required permission');
    });

    it('allows admin with AUDIT_VIEW permission to retrieve paginated audit logs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });
  });

  describe('3. ARCH-06: Per-Request Role & Permission Resolution', () => {
    it('immediately reflects database role escalation on next request without new login/token', async () => {
      // Verify member currently gets 403
      await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Cookie', [memberSessionCookie])
        .expect(403);

      // Dynamically grant admin role in database
      await prisma.roleAssignment.create({
        data: {
          userId: memberUserId,
          roleId: adminRoleId,
        },
      });

      // Request again using the EXACT SAME session cookie — must now succeed (200 OK)!
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs')
        .set('Cookie', [memberSessionCookie])
        .expect(200);

      expect(res.body.data).toBeDefined();
    });
  });

  describe('4. Audit Log Querying & Filtering', () => {
    it('filters logs by action parameter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs?action=E2E_IMMUTABILITY_TEST')
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      for (const entry of res.body.data) {
        expect(entry.action).toBe('E2E_IMMUTABILITY_TEST');
      }
    });

    it('rejects invalid filter with 400 VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/audit-logs?actor_id=invalid-uuid-format')
        .set('Cookie', [adminSessionCookie])
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('5. Member Event Registration & Cancellation Authorization (TASK-002 / B02 / F05)', () => {
    let testEventId: string;
    const csrfToken = 'test-csrf-token-32-chars-at-least-12345';
    const csrfCookie = `csi_csrf=${csrfToken}`;

    beforeAll(async () => {
      const venue = await prisma.venue.create({
        data: {
          name: 'Main Auditorium E2E',
          capacity: 100,
          isActive: true,
        },
      });

      const event = await prisma.event.create({
        data: {
          title: 'Cybersecurity Symposium 2026',
          slug: 'cybersecurity-symposium-2026',
          category: 'workshop',
          description: 'Hands-on defense workshop.',
          state: 'published',
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 90000000),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 80000000),
          capacity: 50,
          venueId: venue.id,
        },
      });
      testEventId = event.id;
    });

    it('rejects unauthenticated caller on POST /api/events/:id/register with 401', async () => {
      await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/register`)
        .set('Cookie', [csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({})
        .expect(401);
    });

    it('allows authenticated member to register for event without 403 route misconfiguration', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/register`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Attending symposium' })
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.status).toBe('registered');
      expect(res.body.data.event_id).toBe(testEventId);
      expect(res.body.data.user_id).toBe(memberUserId);
    });

    it('allows authenticated member to cancel their event registration', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/cancel`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({})
        .expect(200);

      expect(res.body.message).toContain('cancelled');
    });

    it('blocks attendee who has already attended from cancelling with 400 CANNOT_CANCEL_ATTENDED (TASK-014 / B18 / F10)', async () => {
      // 1. Re-register member
      await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/register`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Attending symposium' })
        .expect(200);

      // 2. Simulate attendance check-in (status = attended)
      await prisma.registration.updateMany({
        where: { eventId: testEventId, userId: memberUserId },
        data: { status: RegistrationStatus.ATTENDED },
      });

      // 3. Attempting to cancel must be blocked
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/cancel`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({})
        .expect(400);

      expect(cancelRes.body.error.code).toBe(ErrorCode.CANNOT_CANCEL_ATTENDED);
    });

    it('blocks attendee who has already attended from re-registering with 409 ALREADY_ATTENDED (TASK-014 / B18 / F10)', async () => {
      // Member is currently marked ATTENDED
      const regRes = await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/register`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ notes: 'Attempting duplicate registration' })
        .expect(409);

      expect(regRes.body.error.code).toBe(ErrorCode.ALREADY_ATTENDED);
    });

    it('enforces capacity when attendee is ATTENDED and places subsequent registrant on waitlist (TASK-014 / B18 / F10)', async () => {
      // 1. Set event capacity to 1 so the attended member saturates the event
      await prisma.event.update({
        where: { id: testEventId },
        data: { capacity: 1 },
      });

      // 2. Create second member user
      const user2 = await prisma.user.create({
        data: {
          email: 'member2.capacity@gcet.ac.in',
          name: 'Second Member',
          passwordHash: 'dummy',
          status: UserStatus.ACTIVE,
        },
      });

      await prisma.roleAssignment.create({
        data: {
          userId: user2.id,
          roleId: memberRoleId,
        },
      });

      // 3. Create session for user2
      const rawToken2 = generateSecureToken();
      const tokenHash2 = hashToken(rawToken2);
      await prisma.session.create({
        data: {
          userId: user2.id,
          tokenHash: tokenHash2,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const cookie2 = `csi_session=${rawToken2}; Path=/; HttpOnly; SameSite=Strict`;

      // 4. User 2 registers: since capacity = 1 and user 1 is ATTENDED (which consumes a seat),
      // User 2 must be placed on WAITLISTED, NOT registered!
      const res = await request(app.getHttpServer())
        .post(`/api/events/${testEventId}/register`)
        .set('Cookie', [cookie2, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({})
        .expect(200);

      expect(res.body.data.status).toBe(RegistrationStatus.WAITLISTED);
      expect(res.body.data.message).toContain('waitlist');
    });

    it('prevents capacity overflow during concurrent registrations with active attendees (TASK-014 / B18 / F10)', async () => {
      // 1. Create dedicated event with capacity = 3
      const concEvent = await prisma.event.create({
        data: {
          title: 'Concurrency Capacity Event',
          slug: 'concurrency-capacity-event',
          category: 'workshop',
          description: 'Testing concurrency capacity limits',
          state: 'published',
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 90000000),
          capacity: 3,
        },
      });

      // 2. User 1 is already checked in (ATTENDED) - consuming 1 of the 3 seats
      const attendedUser = await prisma.user.create({
        data: {
          email: 'attended.conc@gcet.ac.in',
          name: 'Attended Member',
          passwordHash: 'dummy',
          status: UserStatus.ACTIVE,
        },
      });
      await prisma.registration.create({
        data: {
          eventId: concEvent.id,
          userId: attendedUser.id,
          status: RegistrationStatus.ATTENDED,
        },
      });

      // 3. Create 4 distinct candidate members
      const candidates: { cookie: string; id: string }[] = [];
      for (let i = 1; i <= 4; i++) {
        const cand = await prisma.user.create({
          data: {
            email: `candidate${i}.conc@gcet.ac.in`,
            name: `Candidate ${i}`,
            passwordHash: 'dummy',
            status: UserStatus.ACTIVE,
          },
        });
        await prisma.roleAssignment.create({
          data: {
            userId: cand.id,
            roleId: memberRoleId,
          },
        });
        const token = generateSecureToken();
        await prisma.session.create({
          data: {
            userId: cand.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        candidates.push({
          id: cand.id,
          cookie: `csi_session=${token}; Path=/; HttpOnly; SameSite=Strict`,
        });
      }

      // 4. Fire 4 simultaneous registration requests under load
      const results = await Promise.all(
        candidates.map((cand) =>
          request(app.getHttpServer())
            .post(`/api/events/${concEvent.id}/register`)
            .set('Cookie', [cand.cookie, csrfCookie])
            .set('x-csrf-token', csrfToken)
            .send({}),
        ),
      );

      for (const res of results) {
        expect(res.status).toBe(200);
      }

      const registeredCount = results.filter((r) => r.body.data.status === RegistrationStatus.REGISTERED).length;
      const waitlistedCount = results.filter((r) => r.body.data.status === RegistrationStatus.WAITLISTED).length;

      // Exactly 2 of the 4 could be seated (since capacity = 3 and 1 seat was ATTENDED)
      expect(registeredCount).toBe(2);
      expect(waitlistedCount).toBe(2);

      // Verify total seat-consuming records in DB equals exactly event capacity (3)
      const totalSeatConsuming = await prisma.registration.count({
        where: {
          eventId: concEvent.id,
          status: { in: [RegistrationStatus.REGISTERED, RegistrationStatus.ATTENDED] },
        },
      });
      expect(totalSeatConsuming).toBe(3);
    });
  });

  describe('Guest Event Registration Windows & Terminal State Enforcement (TASK-015 / B18 / F11)', () => {
    it('rejects guest registration for event in terminal state COMPLETED', async () => {
      const completedEvent = await prisma.event.create({
        data: {
          title: 'Guest Audit Completed Event',
          slug: 'guest-audit-completed-event',
          category: 'workshop',
          description: 'Testing guest terminal state',
          state: 'completed',
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() - 3600000),
          capacity: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/events/${completedEvent.id}/guests`)
        .send({
          name: 'Guest Tester',
          email: 'guest.completed@example.com',
          college: 'GCET',
          phone: '+919876543210',
          consent_data_processing: true,
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.EVENT_NOT_LIVE);
      expect(res.body.error.message).toContain('not accepted');
    });

    it('rejects guest registration for past concluded event', async () => {
      const pastEvent = await prisma.event.create({
        data: {
          title: 'Guest Audit Past Event',
          slug: 'guest-audit-past-event',
          category: 'workshop',
          description: 'Testing guest concluded event',
          state: 'published',
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() - 10000),
          capacity: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/events/${pastEvent.id}/guests`)
        .send({
          name: 'Guest Tester',
          email: 'guest.past@example.com',
          college: 'GCET',
          phone: '+919876543210',
          consent_data_processing: true,
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.EVENT_NOT_LIVE);
      expect(res.body.error.message).toContain('already ended');
    });

    it('rejects guest registration before registration window opens', async () => {
      const futureWindow = await prisma.event.create({
        data: {
          title: 'Guest Audit Future Window Event',
          slug: 'guest-audit-future-window-event',
          category: 'workshop',
          description: 'Testing guest window open',
          state: 'published',
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 90000000),
          registrationOpensAt: new Date(Date.now() + 3600000),
          capacity: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/events/${futureWindow.id}/guests`)
        .send({
          name: 'Guest Tester',
          email: 'guest.future@example.com',
          college: 'GCET',
          phone: '+919876543210',
          consent_data_processing: true,
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.REGISTRATION_CLOSED);
      expect(res.body.error.message).toContain('not opened yet');
    });

    it('rejects guest registration after registration window closes', async () => {
      const closedWindow = await prisma.event.create({
        data: {
          title: 'Guest Audit Closed Window Event',
          slug: 'guest-audit-closed-window-event',
          category: 'workshop',
          description: 'Testing guest window close',
          state: 'published',
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 90000000),
          registrationOpensAt: new Date(Date.now() - 7200000),
          registrationClosesAt: new Date(Date.now() - 3600000),
          capacity: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/events/${closedWindow.id}/guests`)
        .send({
          name: 'Guest Tester',
          email: 'guest.closed@example.com',
          college: 'GCET',
          phone: '+919876543210',
          consent_data_processing: true,
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.REGISTRATION_CLOSED);
      expect(res.body.error.message).toContain('closed');
    });

    it('accepts guest registration within open registration window', async () => {
      const activeEvent = await prisma.event.create({
        data: {
          title: 'Guest Audit Active Event',
          slug: 'guest-audit-active-event',
          category: 'workshop',
          description: 'Testing guest successful registration',
          state: 'published',
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 90000000),
          registrationOpensAt: new Date(Date.now() - 3600000),
          registrationClosesAt: new Date(Date.now() + 3600000),
          capacity: 10,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/events/${activeEvent.id}/guests`)
        .send({
          name: 'Guest Tester',
          email: 'guest.active@example.com',
          college: 'GCET',
          phone: '+919876543210',
          consent_data_processing: true,
        })
        .expect(200);

      expect(res.body.data.status).toBe(RegistrationStatus.REGISTERED);
      expect(res.body.data.message).toContain('confirmed successfully');

      // Verify guest record exists in database
      const guest = await prisma.eventGuest.findUnique({
        where: {
          event_guest_unique: {
            eventId: activeEvent.id,
            email: 'guest.active@example.com',
          },
        },
      });
      expect(guest).not.toBeNull();
      expect(guest?.status).toBe(RegistrationStatus.REGISTERED);
    });
  });

  afterAll(async () => {
    await prisma.termRollover.deleteMany();
    await prisma.termSnapshot.deleteMany();
    await prisma.academicTerm.deleteMany();
    await prisma.committeeAsset.deleteMany();
    await prisma.checklistRun.deleteMany();
    await prisma.checklistItem.deleteMany();
    await prisma.checklist.deleteMany();
    await prisma.task.deleteMany();
    await prisma.passport.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.certificateBatch.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.eventGuest.deleteMany();
    await prisma.event.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.session.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });
});

