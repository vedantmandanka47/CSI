import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { RoleCode, UserStatus, ErrorCode } from '@csi/shared';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';

describe('Production Hardening & DPDP Privacy Audit (E2E) (M18)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Session cookies
  let adminCookie: string;
  let memberCookie: string;
  let volunteerCookie: string;

  // User IDs
  let adminUserId: string;
  let memberUserId: string;

  const csrfToken = 'test-csrf-token-m18';
  const csrfCookie = `csi_csrf=${csrfToken}`;

  const cleanDb = async () => {
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
    await prisma.idempotencyKey.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSession.deleteMany();
    await prisma.eventGuest.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.session.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.rosterEntry.deleteMany();
    await prisma.event.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.user.deleteMany();
    await prisma.committee.deleteMany();
    await prisma.role.deleteMany();
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    await assertStrictTestDatabase(prisma);

    await cleanDb();

    // 1. Seed Roles
    const adminRole = await prisma.role.create({
      data: {
        code: RoleCode.ADMIN,
        name: 'System Administrator',
        description: 'Superuser with full administrative control',
      },
    });

    const memberRole = await prisma.role.create({
      data: {
        code: RoleCode.MEMBER,
        name: 'General Member',
        description: 'Standard student branch member',
      },
    });

    const volunteerRole = await prisma.role.create({
      data: {
        code: RoleCode.COMMITTEE,
        name: 'Event Coordinator & Scanner',
        description: 'Authorized to scan and verify attendees',
      },
    });

    const passwordHash = await hashPassword('SecureP@ssword123!');

    const createUserSession = async (
      email: string,
      name: string,
      enrollmentNo: string | null,
      roleId: string,
      photo: string | null = null,
      photoConsent: boolean = false,
    ) => {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          enrollmentNo,
          passwordHash,
          photo,
          photoConsent,
          status: UserStatus.ACTIVE,
        },
      });

      await prisma.roleAssignment.create({
        data: {
          userId: user.id,
          roleId,
          termStart: new Date('2026-01-01'),
          termEnd: null,
        },
      });

      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 86400 * 1000);

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      return {
        id: user.id,
        cookie: `csi_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict`,
      };
    };

    const admin = await createUserSession('admin.sec@gcet.ac.in', 'Security Admin', null, adminRole.id);
    adminUserId = admin.id;
    adminCookie = admin.cookie;

    const volunteer = await createUserSession('volunteer.sec@gcet.ac.in', 'Volunteer Scanner', '22CP099', volunteerRole.id);
    volunteerCookie = volunteer.cookie;

    const member = await createUserSession(
      'student.privacy@gcet.ac.in',
      'Privacy-Conscious Student',
      '23CP011',
      memberRole.id,
      'https://storage.gcet.ac.in/photos/23CP011.jpg',
      false, // Photo consent initially false
    );
    memberUserId = member.id;
    memberCookie = member.cookie;
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  describe('1. Endpoint Access Control Hardening (AUD-SEC-02)', () => {
    it('POST /api/id-card/verify denies unauthenticated anonymous callers', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/id-card/verify')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ token: 'csi_pass.invalid.signature' })
        .expect(401);

      expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('POST /api/id-card/verify denies standard members without ATTENDANCE_TAKE permission', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/id-card/verify')
        .set('Cookie', [csrfCookie, memberCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ token: 'csi_pass.invalid.signature' })
        .expect(403);

      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('POST /api/id-card/verify allows authorized volunteer scanner', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/id-card/verify')
        .set('Cookie', [csrfCookie, volunteerCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ token: 'csi_pass.invalidpayload.invalidsignature' })
        .expect(200);

      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.message).toBeDefined();
    });
  });

  describe('2. Photo Consent & Data Minimization (DPDP Privacy)', () => {
    it('GET /api/users suppresses student photograph when photoConsent is false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Cookie', [csrfCookie, adminCookie])
        .expect(200);

      const target = res.body.data.find((u: { id: string }) => u.id === memberUserId);
      expect(target).toBeDefined();
      expect(target.photo_consent).toBe(false);
      expect(target.photo).toBeNull(); // Suppressed by data minimization
    });

    it('PATCH /api/users/:id/photo-consent permits student to grant photo consent', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${memberUserId}/photo-consent`)
        .set('Cookie', [csrfCookie, memberCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ photo_consent: true })
        .expect(200);

      expect(res.body.data.photo_consent).toBe(true);
      expect(res.body.data.photo).toBe('https://storage.gcet.ac.in/photos/23CP011.jpg');
    });

    it('GET /api/users reveals photograph after explicit photo consent is granted', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Cookie', [csrfCookie, adminCookie])
        .expect(200);

      const target = res.body.data.find((u: { id: string }) => u.id === memberUserId);
      expect(target).toBeDefined();
      expect(target.photo_consent).toBe(true);
      expect(target.photo).toBe('https://storage.gcet.ac.in/photos/23CP011.jpg');
    });
  });

  describe('3. Automated Data Retention & TTL Purge (AUD-PRIV-01)', () => {
    it('POST /api/admin/maintenance/retention-purge requires ROSTER_MANAGE permission', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/maintenance/retention-purge')
        .set('Cookie', [csrfCookie, memberCookie])
        .set('X-CSRF-Token', csrfToken)
        .expect(403);
    });

    it('purges expired sessions, tokens, and anonymizes concluded event guest records', async () => {
      // Seed expired session
      await prisma.session.create({
        data: {
          userId: memberUserId,
          tokenHash: hashToken('expired-session-token'),
          expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        },
      });

      // Seed expired verification token
      await prisma.verificationToken.create({
        data: {
          userId: memberUserId,
          tokenHash: hashToken('expired-verification-token'),
          expiresAt: new Date(Date.now() - 3600 * 1000),
        },
      });

      // Seed concluded event > 90 days ago
      const oldEvent = await prisma.event.create({
        data: {
          title: 'Concluded Hackathon 2025',
          slug: 'concluded-hackathon-2025',
          description: 'Historical concluded event',
          category: 'technical',
          startsAt: new Date(Date.now() - 100 * 86400 * 1000),
          endsAt: new Date(Date.now() - 95 * 86400 * 1000),
          capacity: 100,
          state: 'published',
        },
      });

      // Seed guest attendee for old event
      const guest = await prisma.eventGuest.create({
        data: {
          eventId: oldEvent.id,
          name: 'Visiting External Student',
          email: 'external@othercollege.edu',
          college: 'Other Engineering College',
          phone: '+919876543210',
          status: 'registered',
          consentAt: new Date(Date.now() - 100 * 86400 * 1000),
        },
      });

      // Execute retention purge
      const purgeRes = await request(app.getHttpServer())
        .post('/api/admin/maintenance/retention-purge?guestRetentionDays=90')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      expect(purgeRes.body.data.sessionsPurged).toBeGreaterThanOrEqual(1);
      expect(purgeRes.body.data.tokensPurged).toBeGreaterThanOrEqual(1);
      expect(purgeRes.body.data.guestsAnonymized).toBeGreaterThanOrEqual(1);

      // Verify guest is anonymized in database
      const anonymizedGuest = await prisma.eventGuest.findUnique({
        where: { id: guest.id },
      });
      expect(anonymizedGuest?.name).toBe('Anonymized Guest');
      expect(anonymizedGuest?.email).toMatch(/^anonymized-/);
      expect(anonymizedGuest?.phone).toBe('0000000000');
      expect(anonymizedGuest?.status).toBe('anonymized');
    });
  });

  describe('4. Idempotency Key Replay Validation (AUD-CERT-02)', () => {
    it('rejects idempotency key reuse with different request payload (IDEMPOTENCY_PAYLOAD_MISMATCH)', async () => {
      // Create a test event
      const event = await prisma.event.create({
        data: {
          title: 'Certificate Issuance Security Test Event',
          slug: 'cert-sec-test-event-m18',
          description: 'Event for testing idempotency tamper resistance',
          category: 'workshop',
          startsAt: new Date('2026-11-10T10:00:00Z'),
          endsAt: new Date('2026-11-10T12:00:00Z'),
          capacity: 50,
          state: 'published',
        },
      });

      // Seed attendance session and record for member
      const attSession = await prisma.attendanceSession.create({
        data: {
          eventId: event.id,
          name: 'Session 1',
          audience: 'all',
          startsAt: new Date('2026-11-10T10:00:00Z'),
          endsAt: new Date('2026-11-10T12:00:00Z'),
          isOpen: true,
          totpSecret: 'plain-secret-key-base32',
          totpStepSeconds: 30,
          createdById: adminUserId,
        },
      });

      await prisma.attendanceRecord.create({
        data: {
          sessionId: attSession.id,
          eventId: event.id,
          subjectType: 'member',
          subjectId: memberUserId,
          method: 'totp',
          status: 'verified',
          clientUuid: 'test-client-uuid-m18-idemp',
          clientMarkedAt: new Date(),
          verifiedAt: new Date(),
          markedById: adminUserId,
        },
      });

      const idempotencyKey = 'idemp-key-audit-sec-02-test';

      // First batch issuance request
      const firstRes = await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          eventId: event.id,
          certificateType: 'participation',
          eligibilityMode: 'verified_attendance',
        })
        .expect(201);

      expect(firstRes.body.id).toBeDefined();

      // Second request: SAME idempotency key, but DIFFERENT payload (e.g. certificateType: 'merit')
      const tamperedReplayRes = await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [csrfCookie, adminCookie])
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          eventId: event.id,
          certificateType: 'merit', // Altered payload
          eligibilityMode: 'verified_attendance',
        })
        .expect(400);

      expect(tamperedReplayRes.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    });
  });

  describe('5. Offline Sync Conflict Resilience (AUD-DATA-01)', () => {
    it('handles duplicate sync operations gracefully without database constraint crash', async () => {
      const event = await prisma.event.create({
        data: {
          title: 'Offline Sync Resilience Event',
          slug: 'offline-sync-resilience-m18',
          description: 'Testing duplicate sync reconciliation',
          category: 'workshop',
          startsAt: new Date('2026-11-15T10:00:00Z'),
          endsAt: new Date('2026-11-15T12:00:00Z'),
          capacity: 50,
          state: 'published',
        },
      });

      const session = await prisma.attendanceSession.create({
        data: {
          eventId: event.id,
          name: 'Session Sync Test',
          audience: 'all',
          startsAt: new Date('2026-11-15T10:00:00Z'),
          endsAt: new Date('2026-11-15T12:00:00Z'),
          isOpen: true,
          totpSecret: 'plain-secret-sync-test',
          totpStepSeconds: 30,
          createdById: adminUserId,
        },
      });

      // Pre-seed an existing verified record for member
      await prisma.attendanceRecord.create({
        data: {
          sessionId: session.id,
          eventId: event.id,
          subjectType: 'member',
          subjectId: memberUserId,
          method: 'manual',
          status: 'verified',
          clientUuid: 'preseeded-client-uuid-1',
          clientMarkedAt: new Date(),
          verifiedAt: new Date(),
          markedById: adminUserId,
        },
      });

      // Submit offline batch sync with duplicate record for the same member in same session
      const syncRes = await request(app.getHttpServer())
        .post('/api/attendance/sync')
        .set('Cookie', [csrfCookie, volunteerCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          operations: [
            {
              client_uuid: 'duplicate-offline-uuid-99',
              session_id: session.id,
              member_id: memberUserId,
              method: 'manual',
              payload: 'manual-override',
              client_marked_at: new Date().toISOString(),
            },
          ],
        })
        .expect(200);

      expect(syncRes.body.data.conflict_count).toBe(1);
      expect(syncRes.body.data.results[0]?.status).toBe('flagged_conflict');
      expect(syncRes.body.data.results[0]?.message).toContain('Duplicate check-in detected');
    });
  });
});
