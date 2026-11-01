import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { RoleCode, UserStatus, TermStatus, ErrorCode } from '@csi/shared';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';

describe('Annual Term Rollover & Archival (E2E) (M17)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Session cookies
  let adminCookie: string;
  let presidentCookie: string;
  let memberCookie: string;
  let techLeadCookie: string;
  let incomingLeadCookie: string;

  // IDs
  let adminUserId: string;
  let techLeadUserId: string;
  let incomingLeadUserId: string;
  let graduatingStudentId: string;
  let techCommitteeId: string;
  let fromTermId: string;
  let toTermId: string;

  const csrfToken = 'test-csrf-token-m17';
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
    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.session.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.rosterEntry.deleteMany();
    await prisma.event.deleteMany();
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

    // Fail-closed target verification: strictly csi_gcet_test
    await assertStrictTestDatabase(prisma);

    await cleanDb();

    // 1. Create Roles
    const memberRole = await prisma.role.create({
      data: { code: RoleCode.MEMBER, name: 'Student Member', description: 'General Member' },
    });
    const committeeRole = await prisma.role.create({
      data: { code: RoleCode.COMMITTEE, name: 'Committee Member', description: 'Volunteer Member' },
    });
    const coreRole = await prisma.role.create({
      data: { code: RoleCode.CORE, name: 'Core Committee Member', description: 'Domain Lead' },
    });
    const presidentRole = await prisma.role.create({
      data: { code: RoleCode.PRESIDENT, name: 'Branch President', description: 'Chief Executive' },
    });
    const adminRole = await prisma.role.create({
      data: { code: RoleCode.ADMIN, name: 'Administrator', description: 'System Administrator' },
    });

    // 2. Create Committees
    const techCommittee = await prisma.committee.create({
      data: {
        code: 'technical',
        name: 'Technical Committee',
        description: 'Oversees software, infrastructure, and workshops',
      },
    });
    techCommitteeId = techCommittee.id;

    const passwordHash = await hashPassword('M17SecurePass!2026');
    const termCurrentStart = new Date('2026-06-01T00:00:00Z');
    const termCurrentEnd = new Date('2027-05-31T23:59:59Z');

    // Helper to create user and session cookie
    const createUserSession = async (
      email: string,
      name: string,
      enrollmentNo: string | null,
      roles: { roleId: string; committeeId?: string; termStart?: Date; termEnd?: Date | null }[],
    ) => {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          enrollmentNo,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
      });

      for (const r of roles) {
        await prisma.roleAssignment.create({
          data: {
            userId: user.id,
            roleId: r.roleId,
            committeeId: r.committeeId ?? null,
            termStart: r.termStart ?? termCurrentStart,
            termEnd: r.termEnd !== undefined ? r.termEnd : termCurrentEnd,
          },
        });
      }

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

    // Create Admin User (perpetual tenure)
    const admin = await createUserSession('admin.m17@gcet.ac.in', 'System Administrator', null, [
      { roleId: adminRole.id, termEnd: null },
    ]);
    adminUserId = admin.id;
    adminCookie = admin.cookie;

    // Create President User (perpetual tenure)
    const president = await createUserSession('president.m17@gcet.ac.in', 'Branch President', '23IT001', [
      { roleId: memberRole.id, termEnd: null },
      { roleId: presidentRole.id, termEnd: null },
    ]);
    presidentCookie = president.cookie;

    // Create Outgoing Tech Lead (Core in Technical committee for current term)
    const techLead = await createUserSession('techlead.m17@gcet.ac.in', 'Outgoing Tech Lead', '22IT045', [
      { roleId: memberRole.id },
      { roleId: coreRole.id, committeeId: techCommitteeId },
    ]);
    techLeadUserId = techLead.id;
    techLeadCookie = techLead.cookie;

    // Create Graduating 4th Year Student
    const graduate = await createUserSession('graduate.m17@gcet.ac.in', 'Senior Graduating Member', '21IT099', [
      { roleId: memberRole.id },
      { roleId: committeeRole.id, committeeId: techCommitteeId },
    ]);
    graduatingStudentId = graduate.id;

    // Create Roster entry for graduating student (year = 4)
    await prisma.rosterEntry.create({
      data: {
        academicYear: '2026-2027',
        enrollmentNo: '21IT099',
        name: 'Senior Graduating Member',
        branch: 'Information Technology',
        year: 4,
      },
    });

    // Create Standard Member (no executive role)
    const member = await createUserSession('student.m17@gcet.ac.in', 'Junior Member', '24IT100', [
      { roleId: memberRole.id },
    ]);
    memberCookie = member.cookie;

    // Create Incoming Tech Lead (Active member, not yet lead)
    const incomingLead = await createUserSession('incoming.lead@gcet.ac.in', 'Incoming Tech Lead', '23IT050', [
      { roleId: memberRole.id },
    ]);
    incomingLeadUserId = incomingLead.id;
    incomingLeadCookie = incomingLead.cookie;

    // 3. Create Outgoing Academic Term (AY 2026-2027 - Active & Current)
    const fromTerm = await prisma.academicTerm.create({
      data: {
        name: 'Academic Year 2026-2027',
        code: '2026-2027',
        startDate: termCurrentStart,
        endDate: termCurrentEnd,
        status: TermStatus.ACTIVE,
        isCurrent: true,
        createdById: adminUserId,
      },
    });
    fromTermId = fromTerm.id;

    // 4. Create Open Tasks in Outgoing Term
    await prisma.task.create({
      data: {
        committeeId: techCommitteeId,
        title: 'Complete Hackathon Platform Setup',
        status: 'in_progress',
        priority: 'high',
        createdById: techLeadUserId,
      },
    });

    // 5. Create Events and Attendance in Outgoing Term
    const event = await prisma.event.create({
      data: {
        title: 'Annual Tech Summit 2026',
        slug: 'annual-tech-summit-2026',
        description: 'Flagship CSI GCET conference',
        category: 'conference',
        state: 'completed',
        startsAt: new Date('2026-10-15T10:00:00Z'),
        endsAt: new Date('2026-10-15T18:00:00Z'),
      },
    });

    const attSession = await prisma.attendanceSession.create({
      data: {
        eventId: event.id,
        name: 'Morning Keynote Attendance',
        startsAt: new Date('2026-10-15T10:00:00Z'),
        endsAt: new Date('2026-10-15T12:00:00Z'),
        isOpen: false,
        totpSecret: 'base32secretforattendancetesting',
        createdById: adminUserId,
      },
    });

    await prisma.attendanceRecord.create({
      data: {
        sessionId: attSession.id,
        eventId: event.id,
        subjectType: 'member',
        subjectId: techLeadUserId,
        method: 'qr_scan',
        status: 'verified',
        clientUuid: 'm17-test-client-uuid-001',
        verifiedAt: new Date('2026-10-15T11:00:00Z'),
        markedById: adminUserId,
      },
    });
  });

  afterAll(async () => {
    await cleanDb();
    await app.close();
  });

  // =========================================================================
  // Section 1: Authentication & Authorization Controls
  // =========================================================================
  describe('Authorization Controls', () => {
    it('rejects unauthenticated requests to GET /api/admin/terms with 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/admin/terms');
      expect(res.status).toBe(401);
    });

    it('rejects unauthorized member without ROSTER_MANAGE permission with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/terms')
        .set('Cookie', [memberCookie]);

      expect(res.status).toBe(403);
    });

    it('allows branch executive (President) to list academic terms', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/terms')
        .set('Cookie', [presidentCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.currentTerm.code).toBe('2026-2027');
    });
  });

  // =========================================================================
  // Section 2: Academic Term Creation & Validation
  // =========================================================================
  describe('Term Creation & Validation', () => {
    it('rejects creation when startDate is greater than or equal to endDate', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/terms')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Invalid Academic Year',
          code: '2027-2028',
          startDate: '2028-08-01T00:00:00.000Z',
          endDate: '2027-06-30T23:59:59.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate term code with 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/terms')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Duplicate 2026-2027 Term',
          code: '2026-2027',
          startDate: '2026-06-01T00:00:00.000Z',
          endDate: '2027-05-31T23:59:59.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.TERM_ALREADY_EXISTS);
    });

    it('successfully creates new target term (AY 2027-2028) in draft status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/terms')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Academic Year 2027-2028',
          code: '2027-2028',
          startDate: '2026-11-01T00:00:00.000Z',
          endDate: '2027-10-31T23:59:59.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('2027-2028');
      expect(res.body.status).toBe(TermStatus.DRAFT);
      expect(res.body.isCurrent).toBe(false);

      toTermId = res.body.id;
    });
  });

  // =========================================================================
  // Section 3: Rollover Preview & Health Checks
  // =========================================================================
  describe('Rollover Preview', () => {
    it('generates a rollover preview identifying outgoing roles, graduating students, and open tasks', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/rollover/preview')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          fromTermId,
          toTermId,
          incomingAppointments: [
            {
              userId: incomingLeadUserId,
              roleCode: RoleCode.CORE,
              committeeCode: 'technical',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.fromTerm.code).toBe('2026-2027');
      expect(res.body.toTerm.code).toBe('2027-2028');
      expect(res.body.canExecute).toBe(true);

      // Verify outgoing appointments were captured
      expect(res.body.outgoingAppointments.length).toBeGreaterThan(0);
      const outgoingLead = res.body.outgoingAppointments.find(
        (a: { userId: string }) => a.userId === techLeadUserId,
      );
      expect(outgoingLead).toBeDefined();

      // Verify graduating students list includes year 4 senior
      expect(res.body.graduatingMembers.length).toBeGreaterThan(0);
      const graduate = res.body.graduatingMembers.find(
        (g: { id: string }) => g.id === graduatingStudentId,
      );
      expect(graduate).toBeDefined();

      // Verify unresolved open tasks warning
      expect(res.body.unresolvedWorkflows.openTasks.length).toBeGreaterThan(0);
      expect(res.body.suggestedConfirmationCode).toBe('CONFIRM_ROLLOVER_2027-2028');
    });

    it('flags invalid incoming appointment in preview validation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/rollover/preview')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          fromTermId,
          toTermId,
          incomingAppointments: [
            {
              userId: '00000000-0000-0000-0000-000000000000', // Nonexistent user
              roleCode: RoleCode.PRESIDENT,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.canExecute).toBe(false);
      expect(res.body.blockingReasons.length).toBeGreaterThan(0);
      expect(res.body.incomingAppointmentsValidation[0].isValid).toBe(false);
    });
  });

  // =========================================================================
  // Section 4: Rollover Execution & State Transitions
  // =========================================================================
  describe('Rollover Execution', () => {
    it('rejects execution when confirmation code is invalid with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/rollover/execute')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          fromTermId,
          toTermId,
          confirmationCode: 'WRONG_CONFIRMATION_CODE',
          incomingAppointments: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ROLLOVER_CONFIRMATION_INVALID);
    });

    it('successfully executes annual rollover atomically in database transaction', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/rollover/execute')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          fromTermId,
          toTermId,
          confirmationCode: 'CONFIRM_ROLLOVER_2027-2028',
          archiveOpenTasks: true,
          transitionGraduatingMembers: true,
          notes: 'Annual rollover to seating the 2027-2028 executive team',
          incomingAppointments: [
            {
              userId: incomingLeadUserId,
              roleCode: RoleCode.CORE,
              committeeCode: 'technical',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.fromTermCode).toBe('2026-2027');
      expect(res.body.summary.toTermCode).toBe('2027-2028');
      expect(res.body.summary.outgoingRolesClosedCount).toBeGreaterThan(0);
      expect(res.body.summary.graduatingMembersCount).toBeGreaterThan(0);
      expect(res.body.summary.incomingRolesCreatedCount).toBe(1);
      expect(res.body.summary.tasksArchivedCount).toBeGreaterThan(0);
      expect(res.body.summary.snapshotId).toBeDefined();

      // Verify outgoing term is now archived and no longer current
      const archivedTerm = await prisma.academicTerm.findUnique({
        where: { id: fromTermId },
      });
      expect(archivedTerm?.status).toBe(TermStatus.ARCHIVED);
      expect(archivedTerm?.isCurrent).toBe(false);
      expect(archivedTerm?.archivedAt).not.toBeNull();

      // Verify target term is now active and current
      const activeTerm = await prisma.academicTerm.findUnique({
        where: { id: toTermId },
      });
      expect(activeTerm?.status).toBe(TermStatus.ACTIVE);
      expect(activeTerm?.isCurrent).toBe(true);

      // Verify graduating student status updated to graduated
      const gradUser = await prisma.user.findUnique({
        where: { id: graduatingStudentId },
      });
      expect(gradUser?.status).toBe(UserStatus.GRADUATED);

      // Verify open tasks were archived (status = cancelled)
      const tasks = await prisma.task.findMany({
        where: { committeeId: techCommitteeId },
      });
      for (const t of tasks) {
        expect(t.status).toBe('cancelled');
      }

      // Verify immutable audit log recorded
      const rolloverLog = await prisma.auditLog.findFirst({
        where: { action: 'term.rollover_executed' },
      });
      expect(rolloverLog).not.toBeNull();
    });

    it('rejects duplicate rollover into the same term with 400/409', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/rollover/execute')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          fromTermId,
          toTermId,
          confirmationCode: 'CONFIRM_ROLLOVER_2027-2028',
          incomingAppointments: [],
        });

      // Since fromTerm is now archived, rollover fails closed
      expect([400, 409]).toContain(res.status);
    });
  });

  // =========================================================================
  // Section 5: Post-Rollover Workspace Authorization Checks
  // =========================================================================
  describe('Post-Rollover Workspace Access', () => {
    it('revokes active workspace access for outgoing committee lead whose term ended', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [techLeadCookie]);

      // Outgoing lead tenure has expired -> 403 Forbidden
      expect(res.status).toBe(403);
      expect([
        ErrorCode.WORKSPACE_ACCESS_DENIED,
        ErrorCode.COMMITTEE_TENURE_EXPIRED,
      ]).toContain(res.body.error.code);
    });

    it('allows newly seated incoming lead to access the committee workspace', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [incomingLeadCookie]);

      expect(res.status).toBe(200);
      expect(res.body.committee.code).toBe('technical');
      expect(res.body.currentUserAccess.roleCode).toBe(RoleCode.CORE);
    });
  });

  // =========================================================================
  // Section 6: Historical Snapshot & Audit Verification
  // =========================================================================
  describe('Historical Snapshot & Archival Verification', () => {
    it('retrieves immutable term snapshot for the archived 2026-2027 term', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/admin/terms/${fromTermId}/snapshot`)
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.termCode).toBe('2026-2027');
      expect(res.body.metrics).toBeDefined();
      expect(res.body.metrics.totalEvents).toBeGreaterThanOrEqual(1);
      expect(res.body.metrics.totalAttendance).toBeGreaterThanOrEqual(1);
      expect(res.body.rosterSnapshot.length).toBeGreaterThan(0);
    });

    it('retrieves rollover execution history', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/rollover/history')
        .set('Cookie', [adminCookie]);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].toTermCode).toBe('2027-2028');
      expect(res.body.data[0].status).toBe('completed');
    });
  });
});
