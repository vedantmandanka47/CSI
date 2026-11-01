import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus } from '@csi/shared';

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
    await prisma.session.deleteMany();
    await prisma.verificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });
});

