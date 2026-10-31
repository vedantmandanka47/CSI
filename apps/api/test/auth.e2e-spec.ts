import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { assertStrictTestDatabase } from '../src/common/guards/test-db-guard.js';

describe('Auth & Session Subsystem (E2E) (ARCH-05, ARCH-14, SEC-04, SEC-05, SEC-23)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

    // Clean test database tables in reverse dependency order
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
    expect(res.body.verificationToken).toBeDefined();
    verificationToken = res.body.verificationToken;

    // Verify user was stored with status 'pending'
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();
    expect(user?.status).toBe('pending');
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

    expect(forgotRes.body.resetToken).toBeDefined();
    const resetToken = forgotRes.body.resetToken;

    // Reset password
    const newPassword = 'BrandNewPassword123!';
    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
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
});
