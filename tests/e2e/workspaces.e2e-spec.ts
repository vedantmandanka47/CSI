import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus, ErrorCode } from '@csi/shared';

describe('Committee Workspaces & Role-Specific Shells (E2E) (M15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Users & Session Cookies
  let standardMemberCookie: string;
  let techMemberId: string;
  let techMemberCookie: string;
  let dualRoleMemberCookie: string;
  let expiredMemberCookie: string;
  let futureMemberCookie: string;
  let presidentCookie: string;
  let techCommitteeId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // Fail-closed verification: ensure target is strictly csi_gcet_test
    await assertStrictTestDatabase(prisma);

    // Clean tables in reverse dependency order
    await prisma.passport.deleteMany();
    await prisma.certificate.deleteMany();
    await prisma.certificateBatch.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.attendanceSession.deleteMany();
    await prisma.registration.deleteMany();
    await prisma.session.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
    await prisma.committee.deleteMany();
    await prisma.role.deleteMany();

    // 1. Create Roles
    const memberRole = await prisma.role.create({
      data: { code: RoleCode.MEMBER, name: 'Student Member', description: 'General Member' },
    });
    const committeeRole = await prisma.role.create({
      data: { code: RoleCode.COMMITTEE, name: 'Committee Member', description: 'Volunteer Member' },
    });
    const coreRole = await prisma.role.create({
      data: { code: RoleCode.CORE, name: 'Core Head', description: 'Core Committee Head' },
    });
    const subcoreRole = await prisma.role.create({
      data: { code: RoleCode.SUBCORE, name: 'Sub-Core Executive', description: 'Sub-Core Lead' },
    });
    const presidentRole = await prisma.role.create({
      data: { code: RoleCode.PRESIDENT, name: 'President', description: 'Student Branch President' },
    });

    // 2. Create Committees (PE.md M15 Canonical Hubs)
    const techCommittee = await prisma.committee.create({
      data: {
        code: 'technical',
        name: 'Technical Committee',
        description: 'Oversees software challenges, lab operations, and workshops',
      },
    });
    techCommitteeId = techCommittee.id;

    const logisticsCommittee = await prisma.committee.create({
      data: {
        code: 'logistics',
        name: 'Logistics & Operations',
        description: 'Manages venue preparation and physical event setup',
      },
    });

    await prisma.committee.create({
      data: {
        code: 'graphics',
        name: 'Design & Media',
        description: 'Produces digital posters and branding assets',
      },
    });

    const dummyPasswordHash = await hashPassword('TestP@ssw0rd123');

    // 3. User: Standard Member (No committee)
    const standardMember = await prisma.user.create({
      data: {
        email: 'standard.member@gcet.ac.in',
        name: 'Karan Dave',
        enrollmentNo: '21012011010',
        branch: 'Mechanical Engineering',
        year: 2,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: standardMember.id, roleId: memberRole.id },
    });
    const tokenStd = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: standardMember.id,
        tokenHash: hashToken(tokenStd),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    standardMemberCookie = `csi_session=${tokenStd}`;

    // 4. User: Technical Committee Member
    const techMember = await prisma.user.create({
      data: {
        email: 'tech.member@gcet.ac.in',
        name: 'Aarav Patel',
        enrollmentNo: '21012011020',
        branch: 'Computer Engineering',
        year: 3,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    techMemberId = techMember.id;
    await prisma.roleAssignment.create({
      data: { userId: techMember.id, roleId: memberRole.id },
    });
    await prisma.roleAssignment.create({
      data: {
        userId: techMember.id,
        roleId: committeeRole.id,
        committeeId: techCommittee.id,
        termStart: new Date('2026-08-01T00:00:00Z'),
        termEnd: null,
      },
    });
    const tokenTech = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: techMember.id,
        tokenHash: hashToken(tokenTech),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    techMemberCookie = `csi_session=${tokenTech}`;

    // 5. User: Dual-Role Member (Core Head of Technical AND Volunteer in Logistics)
    const dualRoleMember = await prisma.user.create({
      data: {
        email: 'dual.member@gcet.ac.in',
        name: 'Diya Shah',
        enrollmentNo: '21012011030',
        branch: 'Information Technology',
        year: 4,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: dualRoleMember.id, roleId: memberRole.id },
    });
    await prisma.roleAssignment.create({
      data: {
        userId: dualRoleMember.id,
        roleId: coreRole.id,
        committeeId: techCommittee.id,
        termStart: new Date('2026-08-01T00:00:00Z'),
        termEnd: null,
      },
    });
    await prisma.roleAssignment.create({
      data: {
        userId: dualRoleMember.id,
        roleId: committeeRole.id,
        committeeId: logisticsCommittee.id,
        termStart: new Date('2026-08-01T00:00:00Z'),
        termEnd: null,
      },
    });
    const tokenDual = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: dualRoleMember.id,
        tokenHash: hashToken(tokenDual),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    dualRoleMemberCookie = `csi_session=${tokenDual}`;

    // 6. User: Expired Tenure Member (Past term)
    const expiredMember = await prisma.user.create({
      data: {
        email: 'expired.member@gcet.ac.in',
        name: 'Vikram Joshi',
        enrollmentNo: '21012011040',
        branch: 'Civil Engineering',
        year: 4,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: expiredMember.id, roleId: memberRole.id },
    });
    await prisma.roleAssignment.create({
      data: {
        userId: expiredMember.id,
        roleId: committeeRole.id,
        committeeId: techCommittee.id,
        termStart: new Date('2025-08-01T00:00:00Z'),
        termEnd: new Date('2026-05-31T00:00:00Z'), // expired
      },
    });
    const tokenExpired = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: expiredMember.id,
        tokenHash: hashToken(tokenExpired),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    expiredMemberCookie = `csi_session=${tokenExpired}`;

    // 7. User: Future Tenure Member (Term begins next month)
    const futureMember = await prisma.user.create({
      data: {
        email: 'future.member@gcet.ac.in',
        name: 'Pooja Nair',
        enrollmentNo: '21012011050',
        branch: 'Electronics',
        year: 2,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: futureMember.id, roleId: memberRole.id },
    });
    await prisma.roleAssignment.create({
      data: {
        userId: futureMember.id,
        roleId: subcoreRole.id,
        committeeId: techCommittee.id,
        termStart: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // starts in 30 days
        termEnd: null,
      },
    });
    const tokenFuture = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: futureMember.id,
        tokenHash: hashToken(tokenFuture),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    futureMemberCookie = `csi_session=${tokenFuture}`;

    // 8. User: President (Branch Executive)
    const president = await prisma.user.create({
      data: {
        email: 'president@gcet.ac.in',
        name: 'Rohan Verma',
        enrollmentNo: '21012011099',
        branch: 'Computer Engineering',
        year: 4,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    await prisma.roleAssignment.create({
      data: { userId: president.id, roleId: presidentRole.id },
    });
    const tokenPres = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: president.id,
        tokenHash: hashToken(tokenPres),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    presidentCookie = `csi_session=${tokenPres}`;

    // 9. Create a Test Event and Open Attendance Session
    const testEvent = await prisma.event.create({
      data: {
        slug: 'git-workshop-2026',
        title: 'Git & GitHub Deep Dive',
        description: 'Hands-on workshop on version control',
        category: 'technical',
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000),
        state: 'published',
      },
    });

    await prisma.attendanceSession.create({
      data: {
        eventId: testEvent.id,
        name: 'Hands-on Verification',
        isOpen: true,
        totpSecret: 'test-totp-secret-1234',
        createdById: president.id,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication & Boundary Guards', () => {
    it('GET /api/me/workspaces should return 401 when unauthenticated', async () => {
      const res = await request(app.getHttpServer()).get('/api/me/workspaces');
      expect(res.status).toBe(401);
    });

    it('GET /api/workspaces/technical should return 401 when unauthenticated', async () => {
      const res = await request(app.getHttpServer()).get('/api/workspaces/technical');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/me/workspaces', () => {
    it('should return empty list for a standard member with no committee assignments', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/workspaces')
        .set('Cookie', [standardMemberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.isExecutive).toBe(false);
      expect(res.body.workspaces).toHaveLength(0);
      expect(res.body.primaryWorkspace).toBeNull();
    });

    it('should return single active workspace for a committee volunteer', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/workspaces')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.isExecutive).toBe(false);
      expect(res.body.workspaces).toHaveLength(1);
      expect(res.body.workspaces[0].code).toBe('technical');
      expect(res.body.workspaces[0].userRole).toBe(RoleCode.COMMITTEE);
      expect(res.body.primaryWorkspace.code).toBe('technical');
    });

    it('should return multiple workspaces for a dual-role member', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/workspaces')
        .set('Cookie', [dualRoleMemberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.isExecutive).toBe(false);
      expect(res.body.workspaces).toHaveLength(2);
      const codes = res.body.workspaces.map((w: { code: string }) => w.code);
      expect(codes).toContain('technical');
      expect(codes).toContain('logistics');
    });

    it('should return all committee workspaces with executive oversight for President', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/workspaces')
        .set('Cookie', [presidentCookie]);

      expect(res.status).toBe(200);
      expect(res.body.isExecutive).toBe(true);
      expect(res.body.workspaces.length).toBeGreaterThanOrEqual(3);
      expect(res.body.workspaces[0].isExecutiveOversight).toBe(true);
      expect(res.body.workspaces[0].userRole).toBe(RoleCode.PRESIDENT);
    });
  });

  describe('GET /api/workspaces/:committeeCode (Role & Boundary Enforcement)', () => {
    it('should return 404 for a nonexistent committee code', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/nonexistent-committee-code')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.COMMITTEE_NOT_FOUND);
    });

    it('should reject a standard member with 403 WORKSPACE_ACCESS_DENIED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [standardMemberCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.WORKSPACE_ACCESS_DENIED);
    });

    it('should reject cross-committee access with 403 WORKSPACE_ACCESS_DENIED (Technical member attempting Logistics)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/logistics')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.WORKSPACE_ACCESS_DENIED);
    });

    it('should allow access to technical workspace for an authorized technical member', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.committee.code).toBe('technical');
      expect(res.body.currentUserAccess.roleCode).toBe(RoleCode.COMMITTEE);
      expect(res.body.currentUserAccess.isExecutive).toBe(false);
      expect(res.body.metrics.totalMembers).toBeGreaterThanOrEqual(1);
      expect(res.body.members.length).toBeGreaterThanOrEqual(1);
      expect(res.body.activeSessions).toHaveLength(1);
    });

    it('should allow dual-role member to access BOTH technical and logistics workspaces', async () => {
      const resTech = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [dualRoleMemberCookie]);
      expect(resTech.status).toBe(200);
      expect(resTech.body.currentUserAccess.roleCode).toBe(RoleCode.CORE);

      const resLogistics = await request(app.getHttpServer())
        .get('/api/workspaces/logistics')
        .set('Cookie', [dualRoleMemberCookie]);
      expect(resLogistics.status).toBe(200);
      expect(resLogistics.body.currentUserAccess.roleCode).toBe(RoleCode.COMMITTEE);
    });

    it('should reject expired tenure with 403 COMMITTEE_TENURE_EXPIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [expiredMemberCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.COMMITTEE_TENURE_EXPIRED);
    });

    it('should reject future tenure with 403 COMMITTEE_TENURE_NOT_STARTED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [futureMemberCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.COMMITTEE_TENURE_NOT_STARTED);
    });

    it('should allow executive (President) to access any workspace without direct assignment', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/logistics')
        .set('Cookie', [presidentCookie]);

      expect(res.status).toBe(200);
      expect(res.body.committee.code).toBe('logistics');
      expect(res.body.currentUserAccess.isExecutive).toBe(true);
      expect(res.body.currentUserAccess.capabilities.canManageRoster).toBe(true);
      expect(res.body.currentUserAccess.capabilities.canExportData).toBe(true);
    });
  });

  describe('GET /api/workspaces/:committeeCode/members and /events', () => {
    it('should return member roster for authorized member', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical/members')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.members)).toBe(true);
      expect(res.body.members.length).toBeGreaterThanOrEqual(1);
    });

    it('should return events and active sessions for authorized member', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical/events')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(Array.isArray(res.body.activeSessions)).toBe(true);
      expect(res.body.activeSessions).toHaveLength(1);
    });

    it('should reject unauthorized member on members and events subroutes', async () => {
      const resMembers = await request(app.getHttpServer())
        .get('/api/workspaces/logistics/members')
        .set('Cookie', [techMemberCookie]);
      expect(resMembers.status).toBe(403);

      const resEvents = await request(app.getHttpServer())
        .get('/api/workspaces/logistics/events')
        .set('Cookie', [techMemberCookie]);
      expect(resEvents.status).toBe(403);
    });
  });

  describe('Audit Logging Verification', () => {
    it('should record an immutable audit log entry upon workspace access', async () => {
      await request(app.getHttpServer())
        .get('/api/workspaces/technical')
        .set('Cookie', [techMemberCookie]);

      const log = await prisma.auditLog.findFirst({
        where: {
          action: 'workspace.accessed',
          targetType: 'committee',
          targetId: techCommitteeId,
          actorId: techMemberId,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(log).not.toBeNull();
      expect(log?.action).toBe('workspace.accessed');
      expect((log?.afterJson as Record<string, unknown>)?.['committeeCode']).toBe('technical');
    });
  });
});
