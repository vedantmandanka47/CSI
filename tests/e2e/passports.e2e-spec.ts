import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { hashPassword, generateSecureToken, hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { RoleCode, UserStatus, PassportActivityItem } from '@csi/shared';
import { PassportStorageService } from '../../apps/api/src/modules/passports/services/passport-storage.service.js';

describe('Student Activity Passport & Extracurricular Dossier (E2E) (M14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passportStorageService: PassportStorageService;

  let studentAId: string;
  let studentASessionCookie: string;
  let studentBId: string;
  let studentBSessionCookie: string;
  let adminUserId: string;
  let adminSessionCookie: string;

  const csrfToken = 'test-csrf-token-m14';
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
    passportStorageService = app.get(PassportStorageService);

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
    await prisma.session.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.event.deleteMany();
    await prisma.user.deleteMany();
    await prisma.committee.deleteMany();
    await prisma.role.deleteMany();

    // 1. Create Roles
    await prisma.role.createMany({
      data: [
        { code: RoleCode.MEMBER, name: 'Student Member', description: 'General Member' },
        { code: RoleCode.CORE, name: 'Core Committee', description: 'Core Member' },
        { code: RoleCode.ADMIN, name: 'Administrator', description: 'Full Admin' },
      ],
      skipDuplicates: true,
    });
    const memberRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.MEMBER } });
    const coreRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CORE } });
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });

    // 2. Create Technical Committee
    const techCommittee = await prisma.committee.create({
      data: {
        code: 'tech',
        name: 'Technical Committee',
        description: 'Organizes technical workshops and hackathons',
      },
    });

    const dummyPasswordHash = await hashPassword('ValidPass123!@#');

    // 3. Create Student A (Owner)
    const studentA = await prisma.user.create({
      data: {
        email: 'student.a@gcet.ac.in',
        name: 'Ananya Sharma',
        enrollmentNo: '21012011001',
        branch: 'Computer Science & Engineering',
        year: 3,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    studentAId = studentA.id;

    await prisma.roleAssignment.create({
      data: {
        userId: studentA.id,
        roleId: memberRole.id,
      },
    });

    // Also assign Student A to Core role in Technical Committee
    await prisma.roleAssignment.create({
      data: {
        userId: studentA.id,
        roleId: coreRole.id,
        committeeId: techCommittee.id,
        termStart: new Date('2026-08-01T00:00:00Z'),
      },
    });

    const tokenA = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: studentA.id,
        tokenHash: hashToken(tokenA),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    studentASessionCookie = `csi_session=${tokenA}`;

    // 4. Create Student B (Intruder)
    const studentB = await prisma.user.create({
      data: {
        email: 'student.b@gcet.ac.in',
        name: 'Rohan Mehta',
        enrollmentNo: '21012011002',
        branch: 'Information Technology',
        year: 2,
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    studentBId = studentB.id;

    await prisma.roleAssignment.create({
      data: {
        userId: studentB.id,
        roleId: memberRole.id,
      },
    });

    const tokenB = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: studentB.id,
        tokenHash: hashToken(tokenB),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    studentBSessionCookie = `csi_session=${tokenB}`;

    // 5. Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin.m14@gcet.ac.in',
        name: 'Admin Faculty',
        status: UserStatus.ACTIVE,
        passwordHash: dummyPasswordHash,
      },
    });
    adminUserId = adminUser.id;

    await prisma.roleAssignment.create({
      data: {
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    });

    const tokenAdmin = generateSecureToken();
    await prisma.session.create({
      data: {
        userId: adminUser.id,
        tokenHash: hashToken(tokenAdmin),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    adminSessionCookie = `csi_session=${tokenAdmin}`;

    // 6. Create Test Event and Attendance Session
    const testEvent = await prisma.event.create({
      data: {
        slug: 'devops-bootcamp-2026',
        title: 'DevOps & Kubernetes Bootcamp 2026',
        description: 'Hands-on cloud native bootcamp',
        category: 'workshop',
        startsAt: new Date('2026-10-15T09:00:00Z'),
        endsAt: new Date('2026-10-15T17:00:00Z'),
        state: 'published',
      },
    });

    const testSession = await prisma.attendanceSession.create({
      data: {
        eventId: testEvent.id,
        name: 'Main Morning Session',
        startsAt: new Date('2026-10-15T09:00:00Z'),
        endsAt: new Date('2026-10-15T13:00:00Z'),
        totpSecret: 'DUMMYSECRET12345',
        createdById: adminUserId,
      },
    });

    // 7. Record Verified Attendance for Student A
    await prisma.attendanceRecord.create({
      data: {
        sessionId: testSession.id,
        eventId: testEvent.id,
        subjectId: studentA.id,
        subjectType: 'member',
        method: 'qr_scan',
        status: 'verified',
        clientUuid: 'client-uuid-m14-att-1',
        markedById: adminUserId,
      },
    });

    // 8. Issue a Certificate for Student A
    await prisma.certificate.create({
      data: {
        eventId: testEvent.id,
        recipientId: studentA.id,
        recipientEmail: studentA.email,
        recipientName: studentA.name,
        certificateType: 'participation',
        certificateNumber: 'CSI-2026-DEVOPS-PART-001',
        issueDate: '2026-10-15',
        status: 'generated',
        storagePath: 'test/cert-student-a.pdf',
        fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        verificationCodeHash: 'certcodehash1234567890abcdef1234567890abcdef1234567890abcdef1234',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // =========================================================================
  // Section A: Passport Retrieval & Authorization (IDOR Defense)
  // =========================================================================
  describe('GET /api/me/passport', () => {
    it('rejects unauthenticated access with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).get('/api/me/passport');
      expect(res.status).toBe(401);
    });

    it('returns student A own verified activity passport with aggregated records', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/passport')
        .set('Cookie', [studentASessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.student.name).toBe('Ananya Sharma');
      expect(res.body.student.enrollmentNo).toBe('21012011001');

      // Verify summary metrics
      expect(res.body.summary.eventsAttended).toBe(1);
      expect(res.body.summary.certificatesEarned).toBe(1);
      expect(res.body.summary.committeeTenures).toBe(1);
      expect(res.body.summary.totalActivities).toBe(3);

      // Verify activity items
      expect(res.body.activities).toHaveLength(3);
      const eventActivity = res.body.activities.find((a: PassportActivityItem) => a.type === 'event_attendance');
      expect(eventActivity).toBeDefined();
      expect(eventActivity.title).toBe('DevOps & Kubernetes Bootcamp 2026');
      expect(eventActivity.verificationStatus).toBe('verified');
    });

    it('returns empty activities for student B who has no verified records', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/passport')
        .set('Cookie', [studentBSessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.student.name).toBe('Rohan Mehta');
      expect(res.body.summary.eventsAttended).toBe(0);
      expect(res.body.summary.totalActivities).toBe(0);
      expect(res.body.activities).toHaveLength(0);
    });

    it('excludes future role assignments that have not yet commenced', async () => {
      // Create a future role assignment for Student B (starting 30 days from now)
      const coreRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CORE } });
      const techComm = await prisma.committee.findFirstOrThrow();
      const futureRa = await prisma.roleAssignment.create({
        data: {
          userId: studentBId,
          roleId: coreRole.id,
          committeeId: techComm.id,
          termStart: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Future
        },
      });

      const res = await request(app.getHttpServer())
        .get('/api/me/passport')
        .set('Cookie', [studentBSessionCookie]);

      // Clean up future assignment immediately so Student B remains an ordinary member for subsequent tests
      await prisma.roleAssignment.delete({ where: { id: futureRa.id } });

      expect(res.status).toBe(200);
      // Future role must NOT be counted as completed or active tenure
      expect(res.body.summary.committeeTenures).toBe(0);
      const futureRoleItem = res.body.activities.find(
        (a: PassportActivityItem) => a.type === 'committee_role',
      );
      expect(futureRoleItem).toBeUndefined();
    });
  });

  describe('GET /api/passports/user/:userId (Direct Object Access)', () => {
    it('blocks student B from retrieving student A passport (IDOR protection)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/passports/user/${studentAId}`)
        .set('Cookie', [studentBSessionCookie]);

      expect(res.status).toBe(403);
    });

    it('allows student A to retrieve their own passport by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/passports/user/${studentAId}`)
        .set('Cookie', [studentASessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.student.id).toBe(studentAId);
    });

    it('allows administrator to access student passport', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/passports/user/${studentAId}`)
        .set('Cookie', [adminSessionCookie]);

      expect(res.status).toBe(200);
      expect(res.body.student.name).toBe('Ananya Sharma');
    });
  });

  // =========================================================================
  // Section B: Dossier PDF Export & Tamper Verification
  // =========================================================================
  describe('POST /api/me/passport/export', () => {
    it('rejects unauthenticated export with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/me/passport/export')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [csrfCookie]);

      expect(res.status).toBe(401);
    });

    it('generates and downloads a valid tamper-evident PDF dossier for student A', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/me/passport/export')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [studentASessionCookie, csrfCookie]);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('.pdf');

      const pdfBuffer = Buffer.from(res.body);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      // Query database to find the newly created passport record
      const passportRecord = await prisma.passport.findFirst({
        where: { userId: studentAId },
        orderBy: { generatedAt: 'desc' },
      });

      expect(passportRecord).toBeDefined();
      expect(passportRecord!.status).toBe('active');
      expect(passportRecord!.storagePath).toBeDefined();
      expect(passportRecord!.fileHash).toBeDefined();

      expect(passportRecord!.id).toBeDefined();
    });

    it('blocks student B from exporting student A passport via administrative route', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/passports/user/${studentAId}/export`)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [studentBSessionCookie, csrfCookie]);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/me/passport/download', () => {
    it('downloads the latest generated passport PDF for authenticated student', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/passport/download')
        .set('Cookie', [studentASessionCookie]);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.body.length).toBeGreaterThan(1000);
    });
  });

  // =========================================================================
  // Section C: Public Verification & Anti-Forgery Subsystem
  // =========================================================================
  describe('GET /api/passports/verify/:code', () => {
    let testRawCode: string;
    let testCodeHash: string;
    let testPassportId: string;

    beforeAll(async () => {
      // Create a deterministic verified passport for testing
      const { VerificationCodeService } = await import(
        '../../apps/api/src/modules/certificates/verification/verification-code.service.js'
      );
      const codeService = new VerificationCodeService();
      testRawCode = codeService.generateVerificationCode();
      testCodeHash = codeService.hashVerificationCode(testRawCode);

      // Save a dummy PDF to storage
      const { randomUUID } = await import('crypto');
      const testUuid = randomUUID();
      const dummyPdf = Buffer.from('%PDF-1.4 dummy passport content for verification testing');
      const saved = await passportStorageService.savePassportPdf(testUuid, dummyPdf);

      const p = await prisma.passport.create({
        data: {
          id: testUuid,
          userId: studentAId,
          passportNumber: 'CSI-PASS-2026-TEST',
          status: 'active',
          fileHash: saved.fileHash,
          fileSizeBytes: dummyPdf.length,
          storagePath: saved.storagePath,
          verificationCodeHash: testCodeHash,
          summaryJson: {
            eventsAttended: 2,
            certificatesEarned: 1,
            committeeTenures: 1,
            totalActivities: 4,
          },
          generatedAt: new Date(),
        },
      });

      testPassportId = p.id;
    });

    it('returns 200 with authentic verification payload for valid code', async () => {
      const res = await request(app.getHttpServer()).get(`/api/passports/verify/${testRawCode}`);

      expect(res.status).toBe(200);
      expect(res.body.isAuthentic).toBe(true);
      expect(res.body.status).toBe('valid');
      expect(res.body.credentialType).toBe('passport');
      expect(res.body.passportNumber).toBe('CSI-PASS-2026-TEST');
      expect(res.body.studentName).toBe('Ananya Sharma');
      expect(res.body.summaryCounts.eventsAttended).toBe(2);

      // Privacy checks: ZERO student PII leaked
      expect(res.body.email).toBeUndefined();
      expect(res.body.phone).toBeUndefined();
      expect(res.body.enrollmentNo).toBeUndefined();
      expect(res.body.id).toBeUndefined();
      expect(res.body.storagePath).toBeUndefined();
    });

    it('verifies successfully via unified public endpoint /api/verify/:code', async () => {
      const res = await request(app.getHttpServer()).get(`/api/verify/${testRawCode}`);

      expect(res.status).toBe(200);
      expect(res.body.isAuthentic).toBe(true);
      expect(res.body.status).toBe('valid');
      expect(res.body.credentialType).toBe('passport');
      expect(res.body.passportNumber).toBe('CSI-PASS-2026-TEST');
      expect(res.body.studentName).toBe('Ananya Sharma');
    });

    it('returns status: invalid for malformed code', async () => {
      const res = await request(app.getHttpServer()).get('/api/passports/verify/INVALID-CODE');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('invalid');
      expect(res.body.isAuthentic).toBe(false);
    });

    it('returns status: not_found for unknown code', async () => {
      const res = await request(app.getHttpServer()).get('/api/passports/verify/0000-0000-0000-0000');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('not_found');
      expect(res.body.isAuthentic).toBe(false);
    });

    it('detects tampered PDF file and returns status: integrity_mismatch', async () => {
      // Intentionally tamper with the file on disk using the storage service
      await passportStorageService.savePassportPdf(testPassportId, Buffer.from('%PDF-1.4 TAMPERED CONTENT ATTACK'));

      const res = await request(app.getHttpServer()).get(`/api/passports/verify/${testRawCode}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('integrity_mismatch');
      expect(res.body.isAuthentic).toBe(false);
      expect(res.body.message).toContain('integrity check failed');
    });

    it('rejects revocation from unauthorized student with 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/passports/${testPassportId}/revoke`)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [studentBSessionCookie, csrfCookie])
        .send({ reason: 'Disciplinary action taken by college' });

      expect(res.status).toBe(403);
    });

    it('allows administrator to revoke passport and public verification reflects revocation', async () => {
      const revokeRes = await request(app.getHttpServer())
        .post(`/api/passports/${testPassportId}/revoke`)
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [adminSessionCookie, csrfCookie])
        .send({ reason: 'Student graduated and passport term closed.' });

      expect(revokeRes.status).toBe(201);
      expect(revokeRes.body.status).toBe('revoked');

      // Now verify again: should return REVOKED
      const verifyRes = await request(app.getHttpServer()).get(`/api/passports/verify/${testRawCode}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.status).toBe('revoked');
      expect(verifyRes.body.isAuthentic).toBe(false);
      expect(verifyRes.body.revocationReason).toBe('Student graduated and passport term closed.');
    });

    it('supersedes earlier active passports when re-exporting, preserving historical record', async () => {
      // Create a fresh active passport for Student A
      const { VerificationCodeService } = await import(
        '../../apps/api/src/modules/certificates/verification/verification-code.service.js'
      );
      const codeService = new VerificationCodeService();
      const code1 = codeService.generateVerificationCode();
      const codeHash1 = codeService.hashVerificationCode(code1);
      const { randomUUID } = await import('crypto');
      const uuid1 = randomUUID();
      const dummyPdf1 = Buffer.from('%PDF-1.4 dummy passport 1');
      const saved1 = await passportStorageService.savePassportPdf(uuid1, dummyPdf1);

      await prisma.passport.create({
        data: {
          id: uuid1,
          userId: studentAId,
          passportNumber: 'CSI-PASS-HISTORICAL-1',
          status: 'active',
          fileHash: saved1.fileHash,
          fileSizeBytes: dummyPdf1.length,
          storagePath: saved1.storagePath,
          verificationCodeHash: codeHash1,
          summaryJson: { eventsAttended: 1, certificatesEarned: 1, committeeTenures: 1, totalActivities: 3 },
          generatedAt: new Date(Date.now() - 3600000), // 1 hour ago
        },
      });

      // Student A exports a new passport
      const exportRes = await request(app.getHttpServer())
        .post('/api/me/passport/export')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', [studentASessionCookie, csrfCookie]);

      expect(exportRes.status).toBe(200);

      // Now verify the OLD code1: status must be revoked/superseded!
      const verifyOldRes = await request(app.getHttpServer()).get(`/api/verify/${code1}`);
      expect(verifyOldRes.status).toBe(200);
      expect(verifyOldRes.body.status).toBe('revoked');
      expect(verifyOldRes.body.isAuthentic).toBe(false);
      expect(verifyOldRes.body.message).toContain('superseded');
    });

    it('prevents rate-limit bypass when attacker rotates spoofed X-Forwarded-For headers', async () => {
      // Send 30 requests with varying spoofed X-Forwarded-For headers
      for (let i = 1; i <= 30; i++) {
        await request(app.getHttpServer())
          .get('/api/verify/0000-0000-0000-0000')
          .set('X-Forwarded-For', `198.51.100.${i}`);
      }

      // 31st request from same client connection should be rejected with 429 Too Many Requests even with another spoofed IP
      const rateLimitedRes = await request(app.getHttpServer())
        .get('/api/verify/0000-0000-0000-0000')
        .set('X-Forwarded-For', '203.0.113.99');

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.headers['retry-after']).toBeDefined();
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
