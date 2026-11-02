import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  createHmac,
  timingSafeEqual,
  randomUUID,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  KeyObject,
} from 'crypto';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  IdCardData,
  VerifyQrPassResponse,
  ErrorCode,
  UserStatus,
} from '@csi/shared';
import { env } from '../../config/env.js';

export interface QrPassPayload {
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
  private readonly logger = new Logger(IdCardService.name);
  private signingPrivateKey!: KeyObject;
  private verificationPublicKey!: KeyObject;

  constructor(private readonly prisma: PrismaService) {
    this.initKeys();
  }

  /**
   * Initializes Ed25519 asymmetric cryptographic signing and verification keys (AUD-SEC-03).
   */
  private initKeys(): void {
    const parsedPriv = this.parseKey(env.QR_SIGNING_PRIVATE_KEY, true);
    const parsedPub = this.parseKey(env.QR_SIGNING_PUBLIC_KEY, false);

    if (parsedPriv && parsedPub) {
      this.signingPrivateKey = parsedPriv;
      this.verificationPublicKey = parsedPub;
    } else {
      if (env.NODE_ENV === 'production') {
        throw new Error(
          'Valid Ed25519 QR signing keys must be configured in production (AUD-SEC-03).',
        );
      }
      this.logger.warn(
        'Ed25519 QR signing keys not configured; generating ephemeral in-memory Ed25519 keypair for process lifetime.',
      );
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.signingPrivateKey = privateKey;
      this.verificationPublicKey = publicKey;
    }
  }

  /**
   * Parses PEM or Base64-encoded PEM Ed25519 key string into a Node KeyObject.
   */
  private parseKey(raw: string | undefined, isPrivate: boolean): KeyObject | null {
    if (!raw || raw === 'dev_qr_private_key' || raw === 'dev_qr_public_key') {
      return null;
    }
    let str = raw.trim();
    if (!str.startsWith('-----BEGIN')) {
      try {
        const decoded = Buffer.from(str, 'base64').toString('utf8');
        if (decoded.includes('-----BEGIN')) {
          str = decoded;
        }
      } catch {
        // Ignore base64 decode failure and try raw string
      }
    }
    try {
      return isPrivate ? createPrivateKey(str) : createPublicKey(str);
    } catch (e) {
      this.logger.debug(
        `Could not parse ${isPrivate ? 'private' : 'public'} key: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Signs a QR pass payload using asymmetric Ed25519 digital signature.
   */
  signQrPayload(payload: QrPassPayload): string {
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataBuffer = Buffer.from(payloadEncoded, 'utf8');
    const signatureBuffer = sign(null, dataBuffer, this.signingPrivateKey);
    const signatureEncoded = signatureBuffer.toString('base64url');
    return `csi_pass.${payloadEncoded}.${signatureEncoded}`;
  }

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
        message:
          'Your membership account is inactive or graduated. Please contact the chapter counselor.',
      });
    }

    const roles = user.roleAssignments.map((ra) => ra.role.code);
    if (!roles.includes('member')) {
      roles.push('member');
    }

    // Term validity: academic session end
    const validUntil = new Date(user.createdAt);
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    // Cryptographic QR pass generation (60-second rotating validity window with Ed25519 signature)
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

    const qrToken = this.signQrPayload(payload);

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
   * Server-side cryptographic verification of rotating QR pass tokens (Ed25519 asymmetric signature).
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
    const receivedSignatureEncoded = parts[2]!;
    const dataBuffer = Buffer.from(payloadEncoded, 'utf8');

    let isSignatureValid = false;

    // 1. Primary: Asymmetric Ed25519 digital signature verification
    try {
      const sigBuffer = Buffer.from(receivedSignatureEncoded, 'base64url');
      isSignatureValid = verify(null, dataBuffer, this.verificationPublicKey, sigBuffer);
    } catch {
      isSignatureValid = false;
    }

    // 2. Fallback: HMAC-SHA256 support for legacy test tokens (non-production only)
    if (!isSignatureValid && env.NODE_ENV !== 'production' && env.SESSION_SECRET) {
      try {
        const expectedSignature = createHmac('sha256', env.SESSION_SECRET)
          .update(payloadEncoded)
          .digest('base64url');
        const receivedBuf = Buffer.from(receivedSignatureEncoded);
        const expectedBuf = Buffer.from(expectedSignature);
        if (
          receivedBuf.length === expectedBuf.length &&
          timingSafeEqual(receivedBuf, expectedBuf)
        ) {
          isSignatureValid = true;
        }
      } catch {
        // Ignore fallback HMAC failure
      }
    }

    if (!isSignatureValid) {
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
