import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  SignupPayload,
  LoginPayload,
  CurrentUser,
  RoleCode,
  UserStatus,
  computeEffectivePermissions,
} from '@csi/shared';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
} from '../../common/crypto/tokens.js';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  /**
   * User Registration / Signup
   */
  async signup(
    payload: SignupPayload,
    ip?: string,
  ): Promise<{ message: string; verificationRequired: boolean; verificationToken: string; userId: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'A user with this email address already exists',
      });
    }

    if (payload.enrollment_no) {
      const existingEnrollment = await this.prisma.user.findFirst({
        where: { enrollmentNo: payload.enrollment_no },
      });
      if (existingEnrollment) {
        throw new ConflictException({
          code: 'ENROLLMENT_ALREADY_REGISTERED',
          message: 'A user with this enrollment number already exists',
        });
      }
    }

    const passwordHash = await hashPassword(payload.password);
    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const memberRole = await this.prisma.role.findUnique({
      where: { code: RoleCode.MEMBER },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: payload.full_name,
          email: payload.email,
          enrollmentNo: payload.enrollment_no ?? null,
          phone: payload.phone ?? null,
          passwordHash,
          status: UserStatus.PENDING,
        },
      });

      if (memberRole) {
        await tx.roleAssignment.create({
          data: {
            userId: user.id,
            roleId: memberRole.id,
          },
        });
      }

      await tx.verificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'AUTH_SIGNUP',
          targetType: 'users',
          targetId: user.id,
          afterJson: { email: user.email, status: user.status },
          ip,
        },
      });

      return { user, token };
    });

    return {
      message: 'Registration successful. Please verify your email.',
      verificationRequired: true,
      verificationToken: result.token,
      userId: result.user.id,
    };
  }

  /**
   * Email Verification
   */
  async verifyEmail(token: string, ip?: string): Promise<{ message: string }> {
    const tokenHash = hashToken(token);

    const verification = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verification || verification.usedAt || verification.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Verification token is invalid or expired',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: verification.id },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: verification.userId },
        data: { status: UserStatus.ACTIVE },
      });

      await tx.auditLog.create({
        data: {
          actorId: verification.userId,
          action: 'AUTH_EMAIL_VERIFIED',
          targetType: 'users',
          targetId: verification.userId,
          afterJson: { status: UserStatus.ACTIVE },
          ip,
        },
      });
    });

    return { message: 'Email successfully verified. You may now log in.' };
  }

  /**
   * User Credentials Login (Argon2id)
   */
  async login(
    payload: LoginPayload,
    ip?: string,
    userAgent?: string,
  ): Promise<{ user: CurrentUser; sessionToken: string; expiresAt: Date; sessionId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: payload.email },
      include: {
        roleAssignments: {
          where: {
            OR: [{ termEnd: null }, { termEnd: { gte: new Date() } }],
          },
          include: { role: true },
        },
      },
    });

    if (!user) {
      await this.prisma.auditLog.create({
        data: {
          action: 'AUTH_LOGIN_FAILURE',
          targetType: 'users',
          beforeJson: { email: payload.email, reason: 'user_not_found' },
          ip,
        },
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isValidPassword = await verifyPassword(user.passwordHash, payload.password);
    if (!isValidPassword) {
      await this.prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'AUTH_LOGIN_FAILURE',
          targetType: 'users',
          targetId: user.id,
          beforeJson: { email: payload.email, reason: 'bad_password' },
          ip,
        },
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.PENDING) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_PENDING',
          message: 'Account is pending email verification',
        });
      }
      if (user.status === UserStatus.GRADUATED) {
        throw new UnauthorizedException({
          code: 'ACCOUNT_GRADUATED',
          message: 'Account has graduated and is no longer active',
        });
      }
      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is inactive',
      });
    }

    // Generate Session
    const sessionToken = generateSecureToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        ipAddress: ip,
        userAgent,
        expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AUTH_LOGIN_SUCCESS',
        targetType: 'sessions',
        targetId: session.id,
        afterJson: { ip, userAgent },
        ip,
      },
    });

    const activeRoles = user.roleAssignments.map((ra) => ra.role.code as RoleCode);
    const roles: RoleCode[] = activeRoles.length > 0 ? activeRoles : [RoleCode.MEMBER];
    const permissions = Array.from(computeEffectivePermissions(roles));

    const currentUser: CurrentUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      full_name: user.name,
      status: user.status as UserStatus,
      enrollment_no: user.enrollmentNo,
      avatar_url: user.photo,
      roles,
      permissions,
    };

    return {
      user: currentUser,
      sessionToken,
      expiresAt,
      sessionId: session.id,
    };
  }

  /**
   * Session Termination / Logout
   */
  async logout(sessionId?: string, userId?: string, ip?: string): Promise<{ message: string }> {
    if (sessionId) {
      await this.prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'AUTH_LOGOUT',
          targetType: 'sessions',
          targetId: sessionId,
          ip,
        },
      });
    }

    return { message: 'Successfully logged out' };
  }

  /**
   * Forgot Password — Token Request
   */
  async forgotPassword(
    email: string,
    ip?: string,
  ): Promise<{ message: string; resetToken?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Uniform response to prevent email enumeration
    const genericResponse = {
      message: 'If an account exists with this email, a password reset link has been sent.',
    };

    if (!user || user.status !== UserStatus.ACTIVE) {
      return genericResponse;
    }

    const resetToken = generateSecureToken();
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        targetType: 'users',
        targetId: user.id,
        ip,
      },
    });

    return {
      ...genericResponse,
      resetToken, // Returned in dev/test for verification
    };
  }

  /**
   * Reset Password — Token Consume & Session Invalidation
   */
  async resetPassword(
    token: string,
    newPassword: string,
    ip?: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(token);

    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Password reset token is invalid or expired',
      });
    }

    const newPasswordHash = await hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark token as consumed
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });

      // 2. Update user's password
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      });

      // 3. SEC-08: Invalidate all active sessions for this user immediately
      await tx.session.updateMany({
        where: { userId: resetRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 4. Immutable audit log
      await tx.auditLog.create({
        data: {
          actorId: resetRecord.userId,
          action: 'AUTH_PASSWORD_RESET_SUCCESS',
          targetType: 'users',
          targetId: resetRecord.userId,
          ip,
        },
      });
    });

    return { message: 'Password successfully reset. Please log in with your new password.' };
  }

  /**
   * Current User Query
   */
  async me(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: {
          where: {
            OR: [{ termEnd: null }, { termEnd: { gte: new Date() } }],
          },
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User does not exist',
      });
    }

    const activeRoles = user.roleAssignments.map((ra) => ra.role.code as RoleCode);
    const roles: RoleCode[] = activeRoles.length > 0 ? activeRoles : [RoleCode.MEMBER];
    const permissions = Array.from(computeEffectivePermissions(roles));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      full_name: user.name,
      status: user.status as UserStatus,
      enrollment_no: user.enrollmentNo,
      avatar_url: user.photo,
      roles,
      permissions,
    };
  }
}
