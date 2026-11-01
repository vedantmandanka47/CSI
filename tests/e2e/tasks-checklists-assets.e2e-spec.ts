import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus, ErrorCode, TaskStatus, TaskPriority, ChecklistRunStatus, AssetCategory, AssetStatus } from '@csi/shared';

describe('Tasks, Checklists & Asset Workflows (E2E) (M16)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Users & Cookies
  let techLeadCookie: string;
  let techMemberId: string;
  let techMemberCookie: string;
  let logisticsMemberCookie: string;
  let presidentCookie: string;
  let standardMemberCookie: string;

  // Committees
  let techCommitteeId: string;
  let logisticsCommitteeId: string;

  // Test Asset Base64 PNG (1x1 transparent PNG)
  const samplePngBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const csrfToken = 'test-csrf-token-m16';
  const csrfCookie = `csi_csrf=${csrfToken}`;

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
    const presidentRole = await prisma.role.create({
      data: { code: RoleCode.PRESIDENT, name: 'President', description: 'Student Branch President' },
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

    const logisticsCommittee = await prisma.committee.create({
      data: {
        code: 'logistics',
        name: 'Logistics & Operations',
        description: 'Physical equipment and auditorium setups',
      },
    });
    logisticsCommitteeId = logisticsCommittee.id;

    const passwordHash = await hashPassword('M16SecurePassword!2026');
    const now = new Date();
    const termStart = new Date('2026-08-01T00:00:00Z');
    const termEnd = new Date('2027-06-30T00:00:00Z');

    // Helper to create authenticated user and session cookie
    const createUserSession = async (
      email: string,
      name: string,
      roles: { roleId: string; committeeId?: string }[],
    ) => {
      const user = await prisma.user.create({
        data: {
          email,
          name,
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
            termStart,
            termEnd,
          },
        });
      }

      const rawToken = generateSecureToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      return {
        userId: user.id,
        cookie: `csi_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict`,
      };
    };

    // 3. Create users
    const techLead = await createUserSession('tech.lead@gcet.edu.in', 'Tech Lead', [
      { roleId: coreRole.id, committeeId: techCommitteeId },
    ]);
    techLeadCookie = techLead.cookie;

    const techMember = await createUserSession('tech.member@gcet.edu.in', 'Tech Member', [
      { roleId: committeeRole.id, committeeId: techCommitteeId },
    ]);
    techMemberId = techMember.userId;
    techMemberCookie = techMember.cookie;

    const logisticsMember = await createUserSession('logistics.member@gcet.edu.in', 'Logistics Member', [
      { roleId: committeeRole.id, committeeId: logisticsCommitteeId },
    ]);
    logisticsMemberCookie = logisticsMember.cookie;

    const president = await createUserSession('president@gcet.edu.in', 'Branch President', [
      { roleId: presidentRole.id },
    ]);
    presidentCookie = president.cookie;

    const standardMember = await createUserSession('member@gcet.edu.in', 'Regular Member', [
      { roleId: memberRole.id },
    ]);
    standardMemberCookie = standardMember.cookie;
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // Authorization & Cross-Committee Isolation
  // =========================================================================
  describe('Authorization and Cross-Committee Jails', () => {
    it('should return 401 Unauthorized when unauthenticated', async () => {
      const res = await request(app.getHttpServer()).get('/api/workspaces/technical/tasks');
      expect(res.status).toBe(401);
    });

    it('should block non-committee member with 403 WORKSPACE_ACCESS_DENIED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical/tasks')
        .set('Cookie', [standardMemberCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.WORKSPACE_ACCESS_DENIED);
    });

    it('should prevent cross-committee IDOR: Logistics member blocked from Technical tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical/tasks')
        .set('Cookie', [logisticsMemberCookie]);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.WORKSPACE_ACCESS_DENIED);
    });

    it('should prevent cross-committee IDOR: Logistics member blocked from uploading Technical assets', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/assets')
        .set('Cookie', [logisticsMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Unauthorized Asset',
          fileName: 'test.png',
          fileBase64: samplePngBase64,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.WORKSPACE_ACCESS_DENIED);
    });
  });

  // =========================================================================
  // Task Management Workflow
  // =========================================================================
  describe('Task Management Workflow', () => {
    let createdTaskId: string;

    it('should allow authorized member to create a task in their committee', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/tasks')
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Implement OAuth refresh token rotation',
          description: 'Follow RFC 6749 guidelines',
          status: TaskStatus.TODO,
          priority: TaskPriority.HIGH,
          dueDate: '2026-11-20T00:00:00.000Z',
          assignedToId: techMemberId,
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Implement OAuth refresh token rotation');
      expect(res.body.status).toBe(TaskStatus.TODO);
      expect(res.body.priority).toBe(TaskPriority.HIGH);
      expect(res.body.assignedToId).toBe(techMemberId);
      createdTaskId = res.body.id;
    });

    it('should reject assigning task to user from different committee', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/tasks')
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Task with invalid assignment',
          assignedToId: (await prisma.user.findFirst({ where: { email: 'logistics.member@gcet.edu.in' } }))?.id,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.TASK_ASSIGNMENT_INVALID);
    });

    it('should retrieve tasks list with filter support', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/workspaces/technical/tasks?priority=high')
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe(createdTaskId);
    });

    it('should allow updating task status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/workspaces/technical/tasks/${createdTaskId}`)
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          status: TaskStatus.IN_PROGRESS,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should allow President (executive oversight) to view and update task', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/workspaces/technical/tasks/${createdTaskId}`)
        .set('Cookie', [presidentCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          status: TaskStatus.COMPLETED,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TaskStatus.COMPLETED);
    });
  });

  // =========================================================================
  // Checklists & Pre-Event Run Protocols
  // =========================================================================
  describe('Checklists & Pre-Event Run Protocols', () => {
    let checklistId: string;
    let itemId: string;
    let runId: string;

    it('should create a checklist with items', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/checklists')
        .set('Cookie', [techLeadCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Hackathon Pre-Flight System Check',
          description: 'Technical infrastructure checklist before kickoff',
          isTemplate: true,
          items: [
            { title: 'Provision PostgreSQL dev database servers', orderIndex: 1 },
            { title: 'Verify judge grading portal access', orderIndex: 2 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Hackathon Pre-Flight System Check');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.totalItems).toBe(2);
      expect(res.body.completedItems).toBe(0);
      checklistId = res.body.id;
      itemId = res.body.items[0].id;
    });

    it('should toggle checklist item completion status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/workspaces/technical/checklists/${checklistId}/items/${itemId}`)
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          isCompleted: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.isCompleted).toBe(true);
      expect(res.body.completedAt).not.toBeNull();
      expect(res.body.completedById).toBe(techMemberId);
    });

    it('should instantiate an interactive checklist run', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/checklist-runs')
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          checklistId,
        });

      expect(res.status).toBe(201);
      expect(res.body.checklistId).toBe(checklistId);
      expect(res.body.status).toBe(ChecklistRunStatus.IN_PROGRESS);
      runId = res.body.id;
    });

    it('should block regular volunteer from signing off on checklist run', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/workspaces/technical/checklist-runs/${runId}/sign-off`)
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          signOffNotes: 'Volunteer attempt',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.CHECKLIST_SIGN_OFF_UNAUTHORIZED);
    });

    it('should allow CORE lead to sign off on checklist run', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/workspaces/technical/checklist-runs/${runId}/sign-off`)
        .set('Cookie', [techLeadCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          signOffNotes: 'All server clusters confirmed ready by Tech Head.',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(ChecklistRunStatus.SIGNED_OFF);
      expect(res.body.signedOffAt).not.toBeNull();
      expect(res.body.signOffNotes).toBe('All server clusters confirmed ready by Tech Head.');
    });

    it('should reject re-signing an already signed off run with 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/workspaces/technical/checklist-runs/${runId}/sign-off`)
        .set('Cookie', [techLeadCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          signOffNotes: 'Duplicate attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CHECKLIST_RUN_ALREADY_SIGNED);
    });
  });

  // =========================================================================
  // Media Asset Pipeline
  // =========================================================================
  describe('Media Asset Pipeline', () => {
    let assetId: string;

    it('should upload a media asset with base64 data and verify initial draft status', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/assets')
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'CodeSprint 2026 Event Banner',
          category: AssetCategory.BANNER,
          fileName: 'codesprint-banner.png',
          fileBase64: samplePngBase64,
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('CodeSprint 2026 Event Banner');
      expect(res.body.category).toBe(AssetCategory.BANNER);
      expect(res.body.status).toBe(AssetStatus.DRAFT);
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.fileHash).toHaveLength(64);
      assetId = res.body.id;
    });

    it('should download uploaded asset and match binary payload and content-type', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/workspaces/technical/assets/${assetId}/download`)
        .set('Cookie', [techMemberCookie]);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toContain('attachment; filename="codesprint-banner.png"');
      expect(res.body).toBeInstanceOf(Buffer);
    });

    it('should block regular volunteer from reviewing an asset with 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/workspaces/technical/assets/${assetId}/review`)
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          status: AssetStatus.APPROVED,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.ASSET_REVIEW_UNAUTHORIZED);
    });

    it('should allow CORE lead to review and approve asset', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/workspaces/technical/assets/${assetId}/review`)
        .set('Cookie', [techLeadCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          status: AssetStatus.APPROVED,
          reviewNotes: 'Verified GCET & CSI logos match brand requirements.',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(AssetStatus.APPROVED);
      expect(res.body.reviewNotes).toBe('Verified GCET & CSI logos match brand requirements.');
      expect(res.body.reviewedAt).not.toBeNull();
    });

    it('should reject invalid file types with 400 Bad Request', async () => {
      const invalidBase64 = Buffer.from('malicious-executable-content').toString('base64');
      const res = await request(app.getHttpServer())
        .post('/api/workspaces/technical/assets')
        .set('Cookie', [techMemberCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Malicious Executable',
          fileName: 'malware.exe',
          fileBase64: invalidBase64,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.ASSET_INVALID_TYPE);
    });
  });

  // =========================================================================
  // Audit Logging Verification
  // =========================================================================
  describe('Audit Logging Verification', () => {
    it('should have recorded audit log entries for task, checklist, and asset operations', async () => {
      const taskCreatedLog = await prisma.auditLog.findFirst({
        where: { action: 'task.created', targetType: 'task' },
      });
      expect(taskCreatedLog).not.toBeNull();

      const checklistRunLog = await prisma.auditLog.findFirst({
        where: { action: 'checklist_run.signed_off', targetType: 'checklist_run' },
      });
      expect(checklistRunLog).not.toBeNull();

      const assetUploadedLog = await prisma.auditLog.findFirst({
        where: { action: 'asset.uploaded', targetType: 'asset' },
      });
      expect(assetUploadedLog).not.toBeNull();

      const assetReviewedLog = await prisma.auditLog.findFirst({
        where: { action: 'asset.reviewed', targetType: 'asset' },
      });
      expect(assetReviewedLog).not.toBeNull();
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
    await prisma.session.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
    await prisma.committee.deleteMany();
    await prisma.role.deleteMany();
    await app.close();
  });
});
