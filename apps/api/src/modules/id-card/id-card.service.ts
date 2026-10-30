import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  IdCardData,
  VerifyQrPassResponse,
  ErrorCode,
  UserStatus,
} from '@csi/shared';
import { env } from '../../config/env.js';

interface QrPassPayload {
  sub: string;
  eno: string;
  nam: string;
  rol: string[];
  iat: number;
  exp: number;
  jti: string;
}

@Injectable()
export class IdCardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issue dynamic digital membership ID card with time-sensitive signed QR pass (prompt.md §762).
   */
  async getIdCard(userId: string): Promise<IdCardData> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Member record not found.',
      });
    }

    // Eligibility checks (M8 acceptance criteria)
    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_PENDING_APPROVAL,
        message: 'Your student branch membership application is pending executive review.',
      });
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.GRADUATED) {
      throw new ForbiddenException({
        code: ErrorCode.ACCOUNT_DEACTIVATED,
        message: 'Your membership account is inactive or graduated. Please contact the chapter counselor.',
      });
    }

    const roles = user.roleAssignments.map((ra) => ra.role.code);
    if (!roles.includes('member')) {
      roles.push('member');
    }

    // Term validity: academic session end
    const validUntil = new Date(user.createdAt);
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    // Cryptographic QR pass generation (60-second rotating validity window)
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + 60; // 60s rotation
    const payload: QrPassPayload = {
      sub: user.id,
      eno: user.enrollmentNo || '',
      nam: user.name,
      rol: roles,
      iat: nowSec,
      exp: expSec,
      jti: randomUUID(),
    };

    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = env.SESSION_SECRET || 'csi_default_secret_string_32chars_long';
    const signature = createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
    const qrToken = `csi_pass.${payloadEncoded}.${signature}`;

    return {
      id: user.id,
      name: user.name,
      enrollment_no: user.enrollmentNo,
      email: user.email,
      branch: user.branch || 'Engineering & Technology',
      year: user.year || 1,
      status: user.status,
      roles,
      issued_at: user.createdAt.toISOString(),
      valid_until: validUntil.toISOString(),
      qr_token: qrToken,
      photo_url: user.photo,
    };
  }

  /**
   * Server-side cryptographic verification of rotating QR pass tokens.
   */
  async verifyQrPass(token: string): Promise<VerifyQrPassResponse> {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'csi_pass') {
      return {
        valid: false,
        message: 'Invalid or malformed QR membership pass structure.',
      };
    }

    const payloadEncoded = parts[1]!;
    const receivedSignature = parts[2]!;

    const secret = env.SESSION_SECRET || 'csi_default_secret_string_32chars_long';
    const expectedSignature = createHmac('sha256', secret)
      .update(payloadEncoded)
      .digest('base64url');

    // Constant-time signature comparison to eliminate timing attacks (SEC-20)
    const receivedBuf = Buffer.from(receivedSignature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (
      receivedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      return {
        valid: false,
        message: 'Cryptographic signature mismatch. Pass has been altered or forged.',
      };
    }

    let payload: QrPassPayload;
    try {
      const decodedJson = Buffer.from(payloadEncoded, 'base64url').toString('utf-8');
      payload = JSON.parse(decodedJson) as QrPassPayload;
    } catch {
      return {
        valid: false,
        message: 'Unparseable QR token payload.',
      };
    }

    // Expiration check
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > payload.exp) {
      return {
        valid: false,
        user_id: payload.sub,
        message: 'QR pass expired. Please present refreshed digital card.',
      };
    }

    // Database user check
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return {
        valid: false,
        user_id: payload.sub,
        message: 'Associated student membership is not in active standing.',
      };
    }

    return {
      valid: true,
      user_id: user.id,
      enrollment_no: user.enrollmentNo || undefined,
      name: user.name,
      roles: payload.rol,
      message: 'Verified Active CSI GCET Student Member.',
    };
  }
}
