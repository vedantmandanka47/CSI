import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from '../../../../../apps/api/src/modules/auth/auth.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { EmailService } from '../../../../../apps/api/src/infra/email/email.service.js';
import { RoleCode, UserStatus } from '@csi/shared';
import { hashPassword, generateSecureToken, hashToken } from '../../../../../apps/api/src/common/crypto/tokens.js';

describe('AuthService (Phase 1 M3)', () => {
  let service: AuthService;
  let mockEmailService: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendMail: jest.Mock;
    getSentEmails: jest.Mock;
    getLastSentEmail: jest.Mock;
    clearSentEmails: jest.Mock;
  };
  let mockPrisma: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: {
      findUnique: jest.Mock;
    };
    roleAssignment: {
      create: jest.Mock;
    };
    verificationToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    passwordResetToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    session: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      roleAssignment: {
        create: jest.fn(),
      },
      verificationToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      session: {
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockEmailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue(true),
      getSentEmails: jest.fn().mockReturnValue([]),
      getLastSentEmail: jest.fn().mockReturnValue(undefined),
      clearSentEmails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('signup', () => {
    it('throws ConflictException if email is already taken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'existing@gcet.ac.in' });

      await expect(
        service.signup({
          email: 'existing@gcet.ac.in',
          password: 'Password123!',
          full_name: 'Existing User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates pending user, verification token, member role assignment, and audit log', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-member', code: RoleCode.MEMBER });
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-new',
        email: 'new@gcet.ac.in',
        name: 'New Student',
        status: UserStatus.PENDING,
      });

      const res = await service.signup({
        email: 'new@gcet.ac.in',
        password: 'SecurePassword123!',
        full_name: 'New Student',
        enrollment_no: '210010116001',
      });

      expect(res.verificationRequired).toBe(true);
      expect((res as Record<string, unknown>).verificationToken).toBeUndefined();
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.verificationToken.create).toHaveBeenCalled();
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledWith(
        'new@gcet.ac.in',
        'New Student',
        expect.any(String),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AUTH_SIGNUP' }),
        }),
      );
    });

    it('never returns verificationToken in signup response envelope (TASK-003 / B03)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-member', code: RoleCode.MEMBER });
      mockPrisma.user.create.mockResolvedValue({
        id: 'u-secure',
        email: 'secure@gcet.ac.in',
        name: 'Secure Student',
        status: UserStatus.PENDING,
      });

      const res = await service.signup({
        email: 'secure@gcet.ac.in',
        password: 'SecurePassword123!',
        full_name: 'Secure Student',
      });

      expect(res).not.toHaveProperty('verificationToken');
      expect(Object.keys(res).sort()).toEqual(
        ['message', 'userId', 'verificationRequired'].sort(),
      );
      expect(mockEmailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('verifyEmail', () => {
    it('throws BadRequestException on invalid or expired token', async () => {
      mockPrisma.verificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(BadRequestException);
    });

    it('activates user, consumes token, and writes audit log on valid token', async () => {
      mockPrisma.verificationToken.findUnique.mockResolvedValue({
        id: 'vt-1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      const res = await service.verifyEmail('valid-token');
      expect(res.message).toContain('successfully verified');
      expect(mockPrisma.verificationToken.update).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { status: UserStatus.ACTIVE },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AUTH_EMAIL_VERIFIED' }),
        }),
      );
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException and audits when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@gcet.ac.in', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AUTH_LOGIN_FAILURE' }),
        }),
      );
    });

    it('throws UnauthorizedException and audits when password is wrong', async () => {
      const realHash = await hashPassword('CorrectPassword123!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@gcet.ac.in',
        passwordHash: realHash,
        status: UserStatus.ACTIVE,
        roleAssignments: [],
      });

      await expect(
        service.login({ email: 'user@gcet.ac.in', password: 'WrongPassword123!' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AUTH_LOGIN_FAILURE' }),
        }),
      );
    });

    it('throws UnauthorizedException if account is pending verification', async () => {
      const realHash = await hashPassword('CorrectPassword123!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@gcet.ac.in',
        passwordHash: realHash,
        status: UserStatus.PENDING,
        roleAssignments: [],
      });

      await expect(
        service.login({ email: 'user@gcet.ac.in', password: 'CorrectPassword123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('creates active session, audits, and returns user with roles on successful credentials', async () => {
      const realHash = await hashPassword('CorrectPassword123!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'user@gcet.ac.in',
        name: 'Jane Doe',
        passwordHash: realHash,
        status: UserStatus.ACTIVE,
        enrollmentNo: '210010116001',
        photo: null,
        roleAssignments: [
          {
            role: { code: RoleCode.MEMBER },
            termEnd: null,
          },
        ],
      });
      mockPrisma.session.create.mockResolvedValue({ id: 'sess-1' });

      const res = await service.login(
        { email: 'user@gcet.ac.in', password: 'CorrectPassword123!' },
        '127.0.0.1',
        'Mozilla/5.0',
      );

      expect(res.sessionToken).toBeDefined();
      expect(res.user.email).toBe('user@gcet.ac.in');
      expect(res.user.roles).toContain(RoleCode.MEMBER);
      expect(mockPrisma.session.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AUTH_LOGIN_SUCCESS' }),
        }),
      );
    });
  });

  describe('forgotPassword', () => {
    it('returns uniform generic response and NEVER leaks resetToken for active user (B01 / F01)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-active-1',
        email: 'active@gcet.ac.in',
        name: 'Active User',
        status: UserStatus.ACTIVE,
      });

      const res = await service.forgotPassword('active@gcet.ac.in', '127.0.0.1');

      // Uniform response message
      expect(res.message).toBe(
        'If an account exists with this email, a password reset link has been sent.',
      );
      // Critical assertion: resetToken MUST NOT be returned
      expect((res as Record<string, unknown>).resetToken).toBeUndefined();
      expect(Object.keys(res)).toEqual(['message']);

      // Invalidate previous tokens
      expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u-active-1' },
      });

      // Stores hashed token, NOT raw token in DB
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u-active-1',
            tokenHash: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );

      // Sends transactional password reset email (TASK-003)
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'active@gcet.ac.in',
        'Active User',
        expect.any(String),
      );

      // Audit log
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'AUTH_PASSWORD_RESET_REQUESTED',
            actorId: 'u-active-1',
            targetId: 'u-active-1',
            ip: '127.0.0.1',
          }),
        }),
      );
    });

    it('returns identical uniform message for non-existent user and does not leak token or audit', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await service.forgotPassword('nonexistent@gcet.ac.in', '127.0.0.1');

      expect(res.message).toBe(
        'If an account exists with this email, a password reset link has been sent.',
      );
      expect((res as Record<string, unknown>).resetToken).toBeUndefined();
      expect(Object.keys(res)).toEqual(['message']);
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns identical uniform message for inactive/pending user without generating token', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u-pending-1',
        email: 'pending@gcet.ac.in',
        status: UserStatus.PENDING,
      });

      const res = await service.forgotPassword('pending@gcet.ac.in', '127.0.0.1');

      expect(res.message).toBe(
        'If an account exists with this email, a password reset link has been sent.',
      );
      expect((res as Record<string, unknown>).resetToken).toBeUndefined();
      expect(Object.keys(res)).toEqual(['message']);
      expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates password, consumes token, revokes all active sessions, and audits', async () => {
      const token = generateSecureToken();
      const tokenHash = hashToken(token);

      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'u1',
        tokenHash,
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });

      const res = await service.resetPassword(token, 'NewSecurePassword123!');

      expect(res.message).toContain('Password successfully reset');
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalled();
      expect(mockPrisma.user.update).toHaveBeenCalled();
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AUTH_PASSWORD_RESET_SUCCESS' }),
        }),
      );
    });
  });
});
