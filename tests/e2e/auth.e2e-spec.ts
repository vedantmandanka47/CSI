import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infra/prisma/prisma.service.js';
import { EmailService } from '../../apps/api/src/infra/email/email.service.js';
import { assertStrictTestDatabase } from '../../apps/api/src/common/guards/test-db-guard.js';
import { hashToken } from '../../apps/api/src/common/crypto/tokens.js';
import { ErrorCode } from '@csi/shared';

describe('Auth & Session Subsystem (E2E) (ARCH-05, ARCH-14, SEC-04, SEC-05, SEC-23)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailService: EmailService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    emailService = app.get(EmailService);
    emailService.clearSentEmails();

    // Fail-closed verification (U1 / Finding F-01): verify live target is csi_gcet_test before any deletion
    await assertStrictTestDatabase(prisma);

    // Clean test database tables in reverse dependency order
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
    await prisma.driveWindow.deleteMany();

    // Ensure default system roles exist
    await prisma.role.upsert({
      where: { code: 'member' },
      update: {},
      create: {
        code: 'member',
        name: 'Member',
        description: 'Standard CSI student member',
      },
    });

    // Ensure open membership drive window exists (TASK-018 / F04)
    await prisma.driveWindow.create({
      data: {
        type: 'membership',
        isOpen: true,
        opensAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        closesAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = 'e2e.student@gcet.ac.in';
  const testPassword = 'Password123!@#';
  let verificationToken: string;
  let sessionCookie: string;
  let csrfCookie: string;
  let csrfToken: string;

  it('1. GET /api/auth/csrf issues CSRF token and csi_csrf cookie', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/csrf').expect(200);

    expect(res.body.csrfToken).toBeDefined();
    csrfToken = res.body.csrfToken;

    const cookies = res.headers['set-cookie'] as string[] | undefined;
    expect(cookies).toBeDefined();
    const csiCsrfCookie = cookies?.find((c) => c.startsWith('csi_csrf='));
    expect(csiCsrfCookie).toBeDefined();
    csrfCookie = csiCsrfCookie?.split(';')[0] ?? '';
  });

  it('2. POST /api/auth/signup registers a new user in pending state', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: testEmail,
        password: testPassword,
        full_name: 'E2E Test Student',
        enrollment_no: '210010116099',
      })
      .expect(201);

    expect(res.body.verificationRequired).toBe(true);
    // Verification token must NEVER be returned in response body (TASK-003 / B03 / F02)
    expect(res.body.verificationToken).toBeUndefined();

    // Verify token was dispatched securely via transactional email
    const outboundEmail = emailService.getLastSentEmail();
    expect(outboundEmail).toBeDefined();
    expect(outboundEmail?.to).toBe(testEmail);
    expect(outboundEmail?.token).toBeDefined();
    verificationToken = outboundEmail!.token!;

    // Verify user was stored with status 'pending'
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();
    expect(user?.status).toBe('pending');
  });

  it('2a. POST /api/auth/signup rejects non-institutional emails with 400 (TASK-018 / F04)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: 'intruder@gmail.com',
        password: testPassword,
        full_name: 'External Person',
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('2b. POST /api/auth/signup rejects invalid enrollment number formats with 400 (TASK-018 / F04)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email: 'other.student@gcet.ac.in',
        password: testPassword,
        full_name: 'Invalid Enrollment Student',
        enrollment_no: '123',
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('2c. POST /api/auth/signup rejects registration with 403 DRIVE_CLOSED when recruitment drive is closed (TASK-018 / F04)', async () => {
    // Temporarily close membership recruitment drive
    await prisma.driveWindow.update({
      where: { type: 'membership' },
      data: { isOpen: false },
    });

    try {
      const res = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'closed.drive.student@gcet.ac.in',
          password: testPassword,
          full_name: 'Late Student',
          enrollment_no: '210010116088',
        })
        .expect(403);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe(ErrorCode.DRIVE_CLOSED);
    } finally {
      // Restore open recruitment drive window
      await prisma.driveWindow.update({
        where: { type: 'membership' },
        data: { isOpen: true },
      });
    }
  });

  it('3. POST /api/auth/login fails when user is still pending email verification', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(401);

    expect(res.body.error.code).toBe('ACCOUNT_PENDING');
  });

  it('4. POST /api/auth/verify-email activates user account', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(200);

    expect(res.body.message).toContain('successfully verified');

    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user?.status).toBe('active');
  });

  it('4b. POST /api/auth/verify-email rejects re-verification for already active or deactivated account (TASK-004)', async () => {
    // Attempting to re-verify an already active user fails fail-closed
    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: verificationToken })
      .expect(400);

    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_TOKEN'); // Already consumed
  });

  it('4c. POST /api/auth/verify-email rejects verification if account was deactivated or rejected (TASK-004)', async () => {
    // Create an unconsumed verification token for an inactive user
    const deactivatedEmail = 'deactivated.student@gcet.ac.in';
    const rawToken = 'test-unconsumed-deactivated-token-123456';
    const tokenHashStr = hashToken(rawToken);

    const deactUser = await prisma.user.create({
      data: {
        email: deactivatedEmail,
        name: 'Deactivated Student',
        status: 'inactive',
        passwordHash: '$argon2id$placeholder',
      },
    });

    await prisma.verificationToken.create({
      data: {
        userId: deactUser.id,
        tokenHash: tokenHashStr,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/api/auth/verify-email')
      .send({ token: rawToken })
      .expect(400);

    expect(res.body.error.code).toBe('ACCOUNT_NOT_ELIGIBLE');

    // Confirm user is STILL inactive and was NOT re-activated!
    const recheck = await prisma.user.findUnique({ where: { id: deactUser.id } });
    expect(recheck?.status).toBe('inactive');

    // Clean up
    await prisma.verificationToken.deleteMany({ where: { userId: deactUser.id } });
    await prisma.user.delete({ where: { id: deactUser.id } });
  });

  it('4d. POST /api/auth/verify-email handles concurrent verification requests atomically (TASK-006)', async () => {
    const raceEmail = 'concurrent.verify@gcet.ac.in';
    const raceToken = 'concurrent-verify-token-' + Date.now();
    const tokenHashStr = hashToken(raceToken);

    const raceUser = await prisma.user.create({
      data: {
        email: raceEmail,
        name: 'Concurrent Verify Student',
        status: 'pending',
        passwordHash: '$argon2id$placeholder',
      },
    });

    await prisma.verificationToken.create({
      data: {
        userId: raceUser.id,
        tokenHash: tokenHashStr,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    // Fire 2 concurrent verify requests with the exact same token
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: raceToken }),
      request(app.getHttpServer()).post('/api/auth/verify-email').send({ token: raceToken }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one must succeed with 200, and exactly one must fail with 400
    expect(statuses).toEqual([200, 400]);

    const failedRes = resA.status === 400 ? resA : resB;
    expect(failedRes.body.error.code).toMatch(/INVALID_TOKEN|ACCOUNT_NOT_ELIGIBLE/);

    // Clean up
    await prisma.verificationToken.deleteMany({ where: { userId: raceUser.id } });
    await prisma.user.delete({ where: { id: raceUser.id } });
  });

  it('5. POST /api/auth/login authenticates with Argon2id and sets HttpOnly csi_session cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(200);

    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    expect(res.body.user.roles).toContain('member');
    // TASK-005 / B08 / HR-007: Bearer sessionToken must NEVER be returned in login response body
    expect(res.body.sessionToken).toBeUndefined();
    expect(res.body).not.toHaveProperty('sessionToken');

    const rawCookies = res.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
    expect(cookies.length).toBeGreaterThan(0);

    const sessionMatch = cookies.find((c) => c.startsWith('csi_session='));
    expect(sessionMatch).toBeDefined();
    expect(sessionMatch).toContain('HttpOnly');
    sessionCookie = sessionMatch?.split(';')[0] ?? '';

    const csrfMatch = cookies.find((c) => c.startsWith('csi_csrf='));
    expect(csrfMatch).toBeDefined();
    csrfCookie = csrfMatch?.split(';')[0] ?? '';
    csrfToken = csrfMatch?.split(';')[0]?.replace('csi_csrf=', '') ?? '';
  });

  it('6. GET /api/auth/me returns current user profile when session cookie is provided', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', [sessionCookie])
      .expect(200);

    expect(res.body.email).toBe(testEmail);
    expect(res.body.status).toBe('active');
    expect(res.body.roles).toContain('member');
    expect(res.body.permissions).toBeInstanceOf(Array);
  });

  it('7. GET /api/auth/me rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('8. POST /api/auth/logout with missing CSRF token returns 403 CSRF_INVALID', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie])
      // Intentionally omitting X-CSRF-Token header
      .expect(403);

    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('9. POST /api/auth/logout with valid session and CSRF headers invalidates session', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken)
      .expect(200);

    expect(res.body.message).toBe('Successfully logged out');

    // After logout, GET /api/auth/me using old session cookie must fail with 401
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', [sessionCookie])
      .expect(401);
  });

  it('10. Password reset flow creates token, resets password, and invalidates existing sessions', async () => {
    // Request forgot password
    const forgotRes = await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email: testEmail })
      .expect(200);

    // Negative security assertion (B01 / F01 / CR-002): resetToken must NEVER leak in API response
    expect(forgotRes.body.resetToken).toBeUndefined();
    expect(forgotRes.body.message).toContain('password reset link has been sent');

    // Create a known test reset token directly in database to test reset-password consumption
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();

    const knownResetToken = 'e2e-test-reset-token-' + Date.now();
    await prisma.passwordResetToken.create({
      data: {
        userId: user!.id,
        tokenHash: hashToken(knownResetToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Reset password
    const newPassword = 'BrandNewPassword123!';
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({
        token: knownResetToken,
        new_password: newPassword,
      })
      .expect(200);

    // Old password must now fail
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: testPassword,
      })
      .expect(401);

    // Re-using the consumed reset token must fail fail-closed (TASK-006)
    const reuseRes = await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({
        token: knownResetToken,
        new_password: 'YetAnotherPassword123!',
      })
      .expect(400);

    expect(reuseRes.body.error.code).toBe('INVALID_TOKEN');

    // New password must succeed
    const newLoginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: newPassword,
      })
      .expect(200);

    expect(newLoginRes.body.user.email).toBe(testEmail);
  });

  it('10b. POST /api/auth/reset-password handles concurrent reset requests atomically (TASK-006)', async () => {
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();

    const concurrentResetToken = 'e2e-concurrent-reset-' + Date.now();
    await prisma.passwordResetToken.create({
      data: {
        userId: user!.id,
        tokenHash: hashToken(concurrentResetToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Fire 2 concurrent reset requests with the same token
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).post('/api/auth/reset-password').send({
        token: concurrentResetToken,
        new_password: 'ConcurrentPassword1!',
      }),
      request(app.getHttpServer()).post('/api/auth/reset-password').send({
        token: concurrentResetToken,
        new_password: 'ConcurrentPassword2!',
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 400]);

    const failedRes = resA.status === 400 ? resA : resB;
    expect(failedRes.body.error.code).toBe('INVALID_TOKEN');
  });

  it('11. Rate limiter triggers 429 TOO_MANY_REQUESTS upon repeated abuse (SEC-05)', async () => {
    const rapidIP = '198.51.100.42';

    // 5 attempts should trigger rate limit on 6th
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', rapidIP)
        .send({
          email: 'nonexistent@gcet.ac.in',
          password: 'BadPassword1!',
        });
    }

    const rateLimitedRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', rapidIP)
      .send({
        email: 'nonexistent@gcet.ac.in',
        password: 'BadPassword1!',
      })
      .expect(429);

    expect(rateLimitedRes.body.error.code).toBe('RATE_LIMITED');
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
