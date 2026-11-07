import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from '../../../../../apps/api/src/modules/auth/auth.controller.js';
import { AuthService } from '../../../../../apps/api/src/modules/auth/auth.service.js';
import { RateLimiterService } from '../../../../../apps/api/src/common/services/rate-limiter.service.js';
import { CurrentUser, RoleCode, UserStatus } from '@csi/shared';

describe('AuthController (TASK-005 / B08 / HR-007)', () => {
  let controller: AuthController;
  let mockAuthService: {
    signup: jest.Mock;
    verifyEmail: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
  };
  let mockRateLimiter: {
    assertLimit: jest.Mock;
    reset: jest.Mock;
  };

  const sampleUser: CurrentUser = {
    id: 'user-uuid-1',
    name: 'Student Name',
    full_name: 'Student Name',
    email: 'student@gcet.ac.in',
    status: UserStatus.ACTIVE,
    enrollment_no: '210010116001',
    roles: [RoleCode.MEMBER],
    permissions: [],
  };

  beforeEach(async () => {
    mockAuthService = {
      signup: jest.fn(),
      verifyEmail: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
    };

    mockRateLimiter = {
      assertLimit: jest.fn(),
      reset: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: RateLimiterService, useValue: mockRateLimiter },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login (TASK-005 / B08 / HR-007)', () => {
    it('sets HttpOnly cookie and NEVER returns sessionToken in JSON response body', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const fakeSessionToken = 'raw-session-token-secret-1234567890';

      mockAuthService.login.mockResolvedValue({
        user: sampleUser,
        sessionToken: fakeSessionToken,
        expiresAt,
        sessionId: 'session-id-1',
      });

      const mockReq = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'TestBrowser/1.0' },
      } as unknown as Request;

      const cookiesSet: Record<string, { val: string; options: Record<string, unknown> }> = {};
      const mockRes = {
        cookie: jest.fn((name: string, val: string, options: Record<string, unknown>) => {
          cookiesSet[name] = { val, options };
        }),
      } as unknown as Response;

      const result = await controller.login(
        { email: 'student@gcet.ac.in', password: 'ValidPassword123!' },
        mockReq,
        mockRes,
      );

      // 1. Rate limiter checks and resets
      expect(mockRateLimiter.assertLimit).toHaveBeenCalledWith(
        'login:192.168.1.100',
        5,
        15 * 60 * 1000,
      );
      expect(mockRateLimiter.reset).toHaveBeenCalledWith('login:192.168.1.100');

      // 2. HttpOnly session cookie was set
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'csi_session',
        fakeSessionToken,
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          expires: expiresAt,
        }),
      );

      // 3. CSRF cookie was refreshed
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'csi_csrf',
        expect.any(String),
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
        }),
      );

      // 4. Critical assertion (TASK-005): sessionToken MUST NOT be in response body
      expect(result).not.toHaveProperty('sessionToken');
      expect((result as Record<string, unknown>).sessionToken).toBeUndefined();
      expect(Object.keys(result).sort()).toEqual(['message', 'user'].sort());
      expect(result.user).toEqual(sampleUser);
      expect(result.message).toBe('Login successful');
    });

    it('rejects invalid login payload with BadRequestException', async () => {
      const mockReq = { ip: '127.0.0.1', headers: {} } as unknown as Request;
      const mockRes = { cookie: jest.fn() } as unknown as Response;

      await expect(
        controller.login({ email: 'not-an-email', password: '' }, mockReq, mockRes),
      ).rejects.toThrow(BadRequestException);

      expect(mockAuthService.login).not.toHaveBeenCalled();
    });
  });

  describe('csrf', () => {
    it('sets csi_csrf cookie and returns token', () => {
      const mockRes = { cookie: jest.fn() } as unknown as Response;
      const result = controller.getCsrfToken(mockRes);

      expect(result.csrfToken).toBeDefined();
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'csi_csrf',
        result.csrfToken,
        expect.objectContaining({
          httpOnly: false,
          sameSite: 'lax',
          path: '/',
        }),
      );
    });
  });

  describe('signup', () => {
    it('validates payload, checks rate limit, and delegates to authService', async () => {
      mockAuthService.signup.mockResolvedValue({
        message: 'Registration successful',
        verificationRequired: true,
        userId: 'u1',
      });

      const mockReq = { ip: '10.0.0.1' } as unknown as Request;
      const payload = {
        full_name: 'Test Student',
        email: 'test@gcet.ac.in',
        password: 'Password123!',
      };

      const result = await controller.signup(payload, mockReq);
      expect(mockRateLimiter.assertLimit).toHaveBeenCalledWith('signup:10.0.0.1', 5, 15 * 60 * 1000);
      expect(mockAuthService.signup).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'test@gcet.ac.in' }),
        '10.0.0.1',
      );
      expect(result).toHaveProperty('verificationRequired', true);
      expect(result).not.toHaveProperty('verificationToken');
    });
  });
});
