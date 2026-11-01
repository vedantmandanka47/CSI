import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { PDFDocument } from 'pdf-lib';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus, CertificateType, RecipientEligibilityMode } from '@csi/shared';
import {
  CertificateBatchProcessorService,
  CertificateStorageService,
  VerificationCodeService,
} from '../../apps/api/src/modules/certificates/index.js';

describe('Certificate Verification & Cryptographic Anti-Forgery Subsystem (E2E) (M13)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let batchProcessor: CertificateBatchProcessorService;
  let verificationCodeService: VerificationCodeService;

  let memberUserId: string;
  let memberSessionCookie: string;
  let adminUserId: string;
  let adminSessionCookie: string;

  let testEventId: string;
  let issuedCertificateId: string;
  let issuedRawCode: string;
  let issuedStoragePath: string;

  const csrfToken = 'test-csrf-token-m13';
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
    verificationCodeService = app.get(VerificationCodeService);

    // Fail-closed verification: ensure target is strictly csi_gcet_test
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
        description: 'Platform Administrator',
      },
    });

    const passwordHash = await hashPassword('SecurePass123!');

    // 1. Create Member User
    const memberUser = await prisma.user.create({
      data: {
        email: 'member.m13@gcet.ac.in',
        name: 'M13 Student Recipient',
        enrollmentNo: '21012011005',
        phone: '9876543210',
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });
    memberUserId = memberUser.id;

    await prisma.roleAssignment.create({
      data: { userId: memberUserId, roleId: memberRole.id },
    });

    const memberRawToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: memberUserId,
        tokenHash: hashToken(memberRawToken),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    memberSessionCookie = `csi_session=${memberRawToken}`;

    // 2. Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin.m13@gcet.ac.in',
        name: 'M13 Chapter Admin',
        enrollmentNo: '21012011001',
        phone: '9876543200',
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });
    adminUserId = adminUser.id;

    await prisma.roleAssignment.create({
      data: { userId: adminUserId, roleId: adminRole.id },
    });

    const adminRawToken = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: adminUserId,
        tokenHash: hashToken(adminRawToken),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    adminSessionCookie = `csi_session=${adminRawToken}`;

    // 3. Create Event & Verified Attendance Session
    const event = await prisma.event.create({
      data: {
        title: 'CSI Cryptographic Anti-Forgery Workshop',
        slug: 'csi-crypto-anti-forgery-workshop',
        description: 'Hands-on workshop on cryptographic verification and anti-forgery.',
        category: 'Workshop',
        state: 'published',
        startsAt: new Date('2026-11-01T10:00:00Z'),
        endsAt: new Date('2026-11-01T14:00:00Z'),
      },
    });
    testEventId = event.id;

    const attSession = await prisma.attendanceSession.create({
      data: {
        eventId: testEventId,
        name: 'Workshop Session',
        createdById: adminUserId,
        startsAt: new Date('2026-11-01T10:00:00Z'),
        endsAt: new Date('2026-11-01T14:00:00Z'),
        totpSecret: 'JBSWY3DPEHPK3PXP',
      },
    });

    await prisma.attendanceRecord.create({
      data: {
        sessionId: attSession.id,
        eventId: testEventId,
        subjectType: 'member',
        subjectId: memberUserId,
        status: 'verified',
        method: 'qr_scan',
        clientUuid: 'm13-test-client-uuid-001',
        markedById: adminUserId,
      },
    });

    // 4. Issue a certificate batch to create a real certificate with QR & verification code
    const batchRes = await request(app.getHttpServer())
      .post('/api/certificates/batches')
      .set('Cookie', [adminSessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .send({
        eventId: testEventId,
        templateId: 'csi-default-participation',
        certificateType: CertificateType.PARTICIPATION,
        eligibilityMode: RecipientEligibilityMode.VERIFIED_ATTENDANCE,
      });

    expect(batchRes.status).toBe(201);
    const batchId = batchRes.body.id;

    // Wait for batch processing to complete
    await batchProcessor.processBatch(batchId);

    // Fetch the issued certificate
    const certRecord = await prisma.certificate.findFirst({
      where: { batchId },
    });
    expect(certRecord).toBeDefined();
    expect(certRecord?.status).toBe('generated');
    expect(certRecord?.verificationCodeHash).toBeDefined();

    issuedCertificateId = certRecord!.id;
    issuedStoragePath = certRecord!.storagePath!;

    // Load generated PDF to extract embedded metadata and verify QR code embedding
    const storageService = app.get(CertificateStorageService);
    const pdfBuffer = await storageService.getCertificatePdf(issuedStoragePath);
    expect(pdfBuffer).toBeDefined();
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    expect(pdfDoc.getPageCount()).toBe(1);

    // To verify against the public endpoint, we need a known verification code
    // Let's create a dedicated test certificate with an exact known code
    issuedRawCode = '4F7A-9B2K-M8NQ-W3R5';
    const knownHash = verificationCodeService.hashVerificationCode(issuedRawCode);

    await prisma.certificate.update({
      where: { id: issuedCertificateId },
      data: {
        verificationCodeHash: knownHash,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
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
      await prisma.idempotencyKey.deleteMany();
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. Public Verification Endpoint (GET /api/verify/:code)', () => {
    it('should verify an authentic certificate without requiring authentication', async () => {
      const res = await request(app.getHttpServer()).get(`/api/verify/${issuedRawCode}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('valid');
      expect(res.body.isAuthentic).toBe(true);
      expect(res.body.certificateNumber).toContain('CSI-');
      expect(res.body.certificateType).toBe(CertificateType.PARTICIPATION);
      expect(res.body.recipientName).toBe('M13 Student Recipient');
      expect(res.body.eventName).toBe('CSI Cryptographic Anti-Forgery Workshop');
      expect(res.body.issuingInstitution).toBe('Computer Society of India - GCET Student Branch');
      expect(res.body.issueDate).toBeDefined();
    });

    it('should verify via the alias route GET /api/certificates/verify/:code', async () => {
      const res = await request(app.getHttpServer()).get(
        `/api/certificates/verify/${issuedRawCode}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('valid');
      expect(res.body.isAuthentic).toBe(true);
    });

    it('should preserve privacy by never exposing sensitive internal fields', async () => {
      const res = await request(app.getHttpServer()).get(`/api/verify/${issuedRawCode}`);

      expect(res.status).toBe(200);
      // Sensitive fields must NOT exist in response payload
      expect(res.body.recipientEmail).toBeUndefined();
      expect(res.body.recipientId).toBeUndefined();
      expect(res.body.enrollmentNo).toBeUndefined();
      expect(res.body.phone).toBeUndefined();
      expect(res.body.storagePath).toBeUndefined();
      expect(res.body.verificationCodeHash).toBeUndefined();
      expect(res.body.id).toBeUndefined();
      expect(res.body.batchId).toBeUndefined();
    });

    it('should normalize lowercase and hyphenated codes correctly', async () => {
      const lowercaseHyphenated = issuedRawCode.toLowerCase(); // '4f7a-9b2k-m8nq-w3r5'
      const res = await request(app.getHttpServer()).get(`/api/verify/${lowercaseHyphenated}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('valid');
      expect(res.body.isAuthentic).toBe(true);
    });

    it('should normalize Crockford visual aliases (I -> 1, L -> 1, O -> 0)', async () => {
      // If code was '4F7A-9B2K-M8NQ-W3R0', and visitor types '4F7A-9B2K-M8NQ-W3RO' (with letter O)
      const testCode = '4F7A-9B2K-M8NQ-W3R0';
      const testHash = verificationCodeService.hashVerificationCode(testCode);

      await prisma.certificate.update({
        where: { id: issuedCertificateId },
        data: { verificationCodeHash: testHash },
      });

      // Query with ambiguous letter 'O' instead of digit '0'
      const resO = await request(app.getHttpServer()).get(`/api/verify/4F7A-9B2K-M8NQ-W3RO`);
      expect(resO.status).toBe(200);
      expect(resO.body.status).toBe('valid');

      // Restore original hash
      await prisma.certificate.update({
        where: { id: issuedCertificateId },
        data: { verificationCodeHash: verificationCodeService.hashVerificationCode(issuedRawCode) },
      });
    });

    it('should return status: invalid for malformed code formats', async () => {
      const res = await request(app.getHttpServer()).get('/api/verify/INVALID-SHORT');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('invalid');
      expect(res.body.isAuthentic).toBe(false);
      expect(res.body.message).toContain('invalid');
    });

    it('should return status: not_found for valid format but non-existent code', async () => {
      const nonExistentCode = 'ZZZZ-ZZZZ-ZZZZ-ZZZZ';
      const res = await request(app.getHttpServer()).get(`/api/verify/${nonExistentCode}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('not_found');
      expect(res.body.isAuthentic).toBe(false);
      expect(res.body.message).toContain('No certificate found');
    });
  });

  describe('2. Document Tamper & Cryptographic Checksum Verification', () => {
    it('should detect document integrity mismatch when stored PDF is tampered with', async () => {
      const cwd = process.cwd();
      const storageRoot = existsSync(resolve(cwd, 'apps/api'))
        ? resolve(cwd, 'apps/api/storage/certificates')
        : resolve(cwd, 'storage/certificates');
      const fullStoragePath = resolve(storageRoot, issuedStoragePath);
      const originalPdfBytes = readFileSync(fullStoragePath);

      try {
        // Tamper with the PDF file on disk by appending arbitrary bytes
        const tamperedBytes = Buffer.concat([originalPdfBytes, Buffer.from('TAMPERED_CONTENT')]);
        writeFileSync(fullStoragePath, tamperedBytes);

        const res = await request(app.getHttpServer()).get(`/api/verify/${issuedRawCode}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('integrity_mismatch');
        expect(res.body.isAuthentic).toBe(false);
        expect(res.body.message).toContain('integrity check failed');
      } finally {
        // Restore original intact PDF
        writeFileSync(fullStoragePath, originalPdfBytes);
      }

      // Verify that after restoration, status returns to valid
      const restoredRes = await request(app.getHttpServer()).get(`/api/verify/${issuedRawCode}`);
      expect(restoredRes.status).toBe(200);
      expect(restoredRes.body.status).toBe('valid');
    });
  });

  describe('3. Certificate Revocation & Transparency', () => {
    it('should reject revocation request without authentication', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/certificates/${issuedCertificateId}/revoke`)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [csrfCookie])
        .send({ reason: 'Unauthorized revocation attempt' });

      expect(res.status).toBe(401);
    });

    it('should reject revocation request by unauthorized member (missing cert.generate)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/certificates/${issuedCertificateId}/revoke`)
        .set('Cookie', [memberSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Member attempt without cert.generate permission' });

      expect(res.status).toBe(403);
    });

    it('should reject revocation request with reason shorter than 5 characters', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/certificates/${issuedCertificateId}/revoke`)
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Bad' });

      expect(res.status).toBe(400);
    });

    it('should allow authorized administrator to revoke certificate with valid reason', async () => {
      const reason = 'Certificate issued in error: attendance check-in invalidated.';

      const res = await request(app.getHttpServer())
        .post(`/api/certificates/${issuedCertificateId}/revoke`)
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ reason });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(issuedCertificateId);
      expect(res.body.status).toBe('revoked');

      // Verify immutable audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'certificate.revoked',
          targetId: issuedCertificateId,
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(adminUserId);
    });

    it('should handle repeated revocation requests idempotently', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/certificates/${issuedCertificateId}/revoke`)
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ reason: 'Repeated revocation attempt' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('revoked');
    });

    it('should reflect revocation on public verification endpoint with transparency details', async () => {
      const res = await request(app.getHttpServer()).get(`/api/verify/${issuedRawCode}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('revoked');
      expect(res.body.isAuthentic).toBe(false);
      expect(res.body.certificateNumber).toContain('CSI-');
      expect(res.body.revokedAt).toBeDefined();
      expect(res.body.revocationReason).toBe(
        'Certificate issued in error: attendance check-in invalidated.',
      );
      expect(res.body.message).toContain('revoked');
    });
  });

  describe('4. Public Rate Limiting Guard', () => {
    it('should include rate limiting headers on public verification endpoint', async () => {
      const res = await request(app.getHttpServer()).get(`/api/verify/${issuedRawCode}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('30');
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });
  });
});
