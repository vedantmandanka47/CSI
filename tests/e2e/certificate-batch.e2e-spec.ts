import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PDFDocument } from 'pdf-lib';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus, CertificateType, RecipientEligibilityMode } from '@csi/shared';
import { CertificateBatchProcessorService } from '../../apps/api/src/modules/certificates/index.js';

describe('Certificate Batch & Idempotency Subsystem (E2E) (M12)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let batchProcessor: CertificateBatchProcessorService;

  let memberUserId: string;
  let memberSessionCookie: string;
  let adminUserId: string;
  let adminSessionCookie: string;
  let otherUserId: string;
  let otherSessionCookie: string;

  let testEventId: string;
  let testSessionId: string;

  const csrfToken = 'test-csrf-token-m12';
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
    batchProcessor = app.get(CertificateBatchProcessorService);

    // Fail-closed verification: ensure target is strictly csi_gcet_test
    await assertStrictTestDatabase(prisma);

    // Clean tables
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
    await prisma.idempotencyKey.deleteMany();

    // Ensure system roles
    const memberRole = await prisma.role.upsert({
      where: { code: RoleCode.MEMBER },
      update: {},
      create: {
        code: RoleCode.MEMBER,
        name: 'Member',
        description: 'Standard CSI member',
      },
    });

    const adminRole = await prisma.role.upsert({
      where: { code: RoleCode.ADMIN },
      update: {},
      create: {
        code: RoleCode.ADMIN,
        name: 'Admin',
        description: 'Administrator with full system privileges',
      },
    });

    const pwHash = await hashPassword('StrongPassword123!');

    // 1. Create standard member user (Attendee)
    const memberUser = await prisma.user.create({
      data: {
        email: 'attendee.m12@gcet.ac.in',
        name: 'Attendee Student',
        enrollmentNo: 'GCET/2026/CS/042',
        passwordHash: pwHash,
        status: UserStatus.ACTIVE,
      },
    });
    memberUserId = memberUser.id;

    await prisma.roleAssignment.create({
      data: { userId: memberUserId, roleId: memberRole.id },
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

    // 2. Create another standard member user (Non-attendee / third party)
    const otherUser = await prisma.user.create({
      data: {
        email: 'other.m12@gcet.ac.in',
        name: 'Other Student',
        enrollmentNo: 'GCET/2026/CS/099',
        passwordHash: pwHash,
        status: UserStatus.ACTIVE,
      },
    });
    otherUserId = otherUser.id;

    await prisma.roleAssignment.create({
      data: { userId: otherUserId, roleId: memberRole.id },
    });

    const otherToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: otherUserId,
        tokenHash: hashToken(otherToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    otherSessionCookie = `csi_session=${otherToken}`;

    // 3. Create administrator user (with cert.generate permission)
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin.m12@gcet.ac.in',
        name: 'Admin Organizer',
        passwordHash: pwHash,
        status: UserStatus.ACTIVE,
      },
    });
    adminUserId = adminUser.id;

    await prisma.roleAssignment.create({
      data: { userId: adminUserId, roleId: adminRole.id },
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

    // 4. Create an active Event with verified attendance
    const event = await prisma.event.create({
      data: {
        slug: 'full-stack-web-summit-2026',
        title: 'Full Stack Web Summit 2026',
        description: 'Comprehensive Web Architecture Bootcamp',
        category: 'workshop',
        startsAt: new Date('2026-10-31T09:00:00Z'),
        endsAt: new Date('2026-10-31T17:00:00Z'),
        capacity: 100,
        state: 'published',
      },
    });
    testEventId = event.id;

    // Create an attendance session
    const attSession = await prisma.attendanceSession.create({
      data: {
        eventId: testEventId,
        name: 'Morning Session',
        startsAt: new Date('2026-10-31T09:00:00Z'),
        endsAt: new Date('2026-10-31T12:00:00Z'),
        totpSecret: 'JBSWY3DPEHPK3PXP',
        createdById: adminUserId,
      },
    });
    testSessionId = attSession.id;

    // Record verified attendance for memberUser
    await prisma.attendanceRecord.create({
      data: {
        sessionId: testSessionId,
        eventId: testEventId,
        subjectType: 'member',
        subjectId: memberUserId,
        method: 'qr_scan',
        status: 'verified',
        clientUuid: 'test-client-uuid-m12-001',
        markedById: adminUserId,
      },
    });
  });

  afterAll(async () => {
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
    await prisma.idempotencyKey.deleteMany();
    await app.close();
  });

  describe('1. Authentication and RBAC Protection', () => {
    it('rejects unauthenticated request to POST /api/certificates/batches with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ eventId: testEventId })
        .expect(401);
    });

    it('rejects member user lacking cert.generate permission with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ eventId: testEventId })
        .expect(403);
    });
  });

  describe('2. Idempotent Batch Creation and Processing', () => {
    let createdBatchId: string;
    const testIdempotencyKey = 'idemp-key-batch-m12-test-01';

    it('creates a certificate batch for verified attendees with 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', testIdempotencyKey)
        .send({
          eventId: testEventId,
          certificateType: CertificateType.PARTICIPATION,
          eligibilityMode: RecipientEligibilityMode.VERIFIED_ATTENDANCE,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.eventId).toBe(testEventId);
      expect(res.body.totalCount).toBe(1);
      expect(res.body.status).toBe('pending');
      createdBatchId = res.body.id;
    });

    it('returns identical cached response on duplicate request with same Idempotency-Key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', testIdempotencyKey)
        .send({
          eventId: testEventId,
          certificateType: CertificateType.PARTICIPATION,
          eligibilityMode: RecipientEligibilityMode.VERIFIED_ATTENDANCE,
        })
        .expect(201);

      expect(res.body.id).toBe(createdBatchId);
      expect(res.body.totalCount).toBe(1);
    });

    it('re-running the batch processor transitions certificates to generated and batch to completed', async () => {
      // Execute the batch processing
      await batchProcessor.processBatch(createdBatchId);

      const res = await request(app.getHttpServer())
        .get(`/api/certificates/batches/${createdBatchId}`)
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(res.body.status).toBe('completed');
      expect(res.body.successCount).toBe(1);
      expect(res.body.failedCount).toBe(0);
      expect(res.body.progressPercent).toBe(100);
    });

    it('rejects duplicate batch request without idempotency key when all participants already have certificates', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/certificates/batches')
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({
          eventId: testEventId,
          certificateType: CertificateType.PARTICIPATION,
          eligibilityMode: RecipientEligibilityMode.VERIFIED_ATTENDANCE,
        })
        .expect(400);

      expect(res.body.error.message).toContain('already have a certificate');
    });

    it('enforces database uniqueness constraint against duplicate issuance attempts', async () => {
      // Direct insertion attempt with identical eventId, recipientEmail, certificateType must throw
      await expect(
        prisma.certificate.create({
          data: {
            eventId: testEventId,
            recipientEmail: 'attendee.m12@gcet.ac.in',
            recipientName: 'Duplicate Attempt',
            certificateType: CertificateType.PARTICIPATION,
            certificateNumber: 'CSI-2026-COLLISION-TEST',
            issueDate: 'October 31, 2026',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('3. Batch Progress and Certificates Listing', () => {
    it('lists certificate batches with pagination via GET /api/certificates/batches', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/certificates/batches')
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(res.body.batches).toBeDefined();
      expect(Array.isArray(res.body.batches)).toBe(true);
      expect(res.body.batches.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('lists certificates in batch with details via GET /api/certificates/batches/:id/certificates', async () => {
      const batchesRes = await request(app.getHttpServer())
        .get('/api/certificates/batches')
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      const batchId = batchesRes.body.batches[0].id;

      const certsRes = await request(app.getHttpServer())
        .get(`/api/certificates/batches/${batchId}/certificates`)
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(certsRes.body.certificates).toBeDefined();
      expect(certsRes.body.certificates.length).toBe(1);
      expect(certsRes.body.certificates[0].recipientEmail).toBe('attendee.m12@gcet.ac.in');
      expect(certsRes.body.certificates[0].status).toBe('generated');
      expect(certsRes.body.certificates[0].certificateNumber).toMatch(/^CSI-2026-/);
    });
  });

  describe('4. Certificate Download & Authorization Security', () => {
    let generatedCertId: string;

    beforeAll(async () => {
      const cert = await prisma.certificate.findFirst({
        where: { eventId: testEventId, status: 'generated' },
      });
      generatedCertId = cert!.id;
    });

    it('allows authorized admin with cert.generate to download any certificate PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/certificates/${generatedCertId}/download`)
        .set('Cookie', [adminSessionCookie])
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename=');

      const pdfBytes = Buffer.from(res.body);
      expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const parsed = await PDFDocument.load(pdfBytes);
      expect(parsed.getPageCount()).toBe(1);
    });

    it('allows certificate recipient to download their own certificate PDF', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/certificates/${generatedCertId}/download`)
        .set('Cookie', [memberSessionCookie])
        .expect(200);

      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment;');
    });

    it('strictly forbids unauthorized third party from downloading another participant certificate', async () => {
      await request(app.getHttpServer())
        .get(`/api/certificates/${generatedCertId}/download`)
        .set('Cookie', [otherSessionCookie])
        .expect(403);
    });

    it('allows recipient to retrieve their issued certificates via GET /api/me/certificates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/certificates')
        .set('Cookie', [memberSessionCookie])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe(generatedCertId);
      expect(res.body[0].eventTitle).toBe('Full Stack Web Summit 2026');
    });

    it('returns empty array via GET /api/me/certificates for user without certificates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/certificates')
        .set('Cookie', [otherSessionCookie])
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });
});
