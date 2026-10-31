import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PDFDocument } from 'pdf-lib';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus } from '@csi/shared';
import { CertificateTemplateEngineService } from '../src/modules/certificates/certificate-template-engine.service.js';

describe('Certificate Template Engine Subsystem (E2E) (M11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let memberUserId: string;
  let memberSessionCookie: string;
  let adminUserId: string;
  let adminSessionCookie: string;
  let memberRoleId: string;
  let adminRoleId: string;

  const csrfToken = 'test-csrf-token-m11';
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

    // Fail-closed verification: ensure target is strictly csi_gcet_test
    await assertStrictTestDatabase(prisma);

    // Clean tables in reverse dependency order
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

    // 1. Create standard member user (no cert.generate permission)
    const memberUser = await prisma.user.create({
      data: {
        email: 'member.m11@gcet.ac.in',
        name: 'Member M11',
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

    // 2. Create administrator user (has cert.generate permission)
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin.m11@gcet.ac.in',
        name: 'Admin M11',
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

  describe('1. Authentication and Authorization (RBAC Guard)', () => {
    it('rejects unauthenticated request to GET /api/certificates/templates/default with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/certificates/templates/default')
        .expect(401);
    });

    it('rejects unauthenticated request to POST /api/certificates/preview with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/certificates/preview')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ template: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE })
        .expect(401);
    });

    it('rejects unauthenticated request to POST /api/certificates/render with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/certificates/render')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          template: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
          data: {
            recipient_name: 'Test',
            event_title: 'Test',
            issue_date: '2026-10-31',
          },
        })
        .expect(401);
    });

    it('rejects member user without cert.generate permission with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/certificates/templates/default')
        .set('Cookie', [memberSessionCookie])
        .expect(403);
    });
  });

  describe('2. Template Inspection and Validation', () => {
    it('returns default CSI participation and merit templates for authorized admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/certificates/templates/default')
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(res.body.participation).toBeDefined();
      expect(res.body.participation.id).toBe('csi-default-participation');
      expect(res.body.merit).toBeDefined();
      expect(res.body.merit.id).toBe('csi-default-merit');
    });

    it('returns supported standard PDF fonts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/certificates/fonts')
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      const fontFamilies = res.body.map((f: { family: string }) => f.family);
      expect(fontFamilies).toContain('Helvetica');
      expect(fontFamilies).toContain('Times-Roman');
      expect(fontFamilies).toContain('Courier');
    });

    it('validates a valid template payload via POST /api/certificates/templates/validate', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/templates/validate')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          template: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
        })
        .expect(200);

      expect(res.body.valid).toBe(true);
      expect(res.body.template.id).toBe('csi-default-participation');
    });

    it('rejects invalid template payload with 400 TEMPLATE_VALIDATION_ERROR', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/templates/validate')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          template: {
            id: '',
            textElements: [],
          },
        })
        .expect(400);

      expect(res.body.error.code).toBe('TEMPLATE_VALIDATION_ERROR');
    });
  });

  describe('3. Certificate Preview and Render', () => {
    it('generates an inline PDF preview via POST /api/certificates/preview', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/preview')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          template: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('inline; filename="certificate-preview.pdf"');

      // Verify the returned bytes form a valid PDF document
      const pdfBytes = Buffer.from(res.body);
      expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const parsedDoc = await PDFDocument.load(pdfBytes);
      expect(parsedDoc.getPageCount()).toBe(1);
    });

    it('renders and downloads a personalized certificate PDF via POST /api/certificates/render', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/render')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          template: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
          data: {
            recipient_name: 'Ananya Sharma',
            recipient_id: 'CSI-2026-M-042',
            event_title: 'Full Stack Web Architecture Bootcamp',
            event_category: 'WORKSHOP',
            issue_date: 'October 31, 2026',
            achievement: 'First Prize',
            certificate_number: 'CSI-GCET-2026-0042',
            college_name: 'GCET Engineering College',
          },
        })
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="certificate-Ananya_Sharma.pdf"');

      const pdfBytes = Buffer.from(res.body);
      expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const parsedDoc = await PDFDocument.load(pdfBytes);
      expect(parsedDoc.getPageCount()).toBe(1);
      expect(parsedDoc.getTitle()).toContain('Ananya Sharma');
      expect(parsedDoc.getAuthor()).toBe('CSI GCET Student Branch');
    });
  });
});
