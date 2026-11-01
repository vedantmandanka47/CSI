import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { VerificationCodeService } from '../../certificates/verification/verification-code.service.js';
import { PassportStorageService } from './passport-storage.service.js';
import {
  VerificationOutcome,
  PublicPassportVerificationResponse,
  PassportSummaryCounts,
  ErrorCode,
} from '@csi/shared';

@Injectable()
export class PassportVerificationService {
  private readonly logger = new Logger(PassportVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationCodeService: VerificationCodeService,
    private readonly storageService: PassportStorageService,
  ) {}

  /**
   * Public, unauthenticated verification of a student activity passport by verification code.
   * Privacy-preserving: Returns only public verification details. Never exposes student email,
   * phone number, enrollment number, internal IDs, or filesystem storage paths.
   */
  async verifyPassport(rawCode: string): Promise<PublicPassportVerificationResponse> {
    if (!rawCode || typeof rawCode !== 'string') {
      return {
        status: VerificationOutcome.INVALID,
        isAuthentic: false,
        credentialType: 'passport',
        message: 'The provided verification code format is invalid.',
      };
    }

    // 1. Syntactic Crockford Base32 check
    if (!this.verificationCodeService.isValidCode(rawCode)) {
      return {
        status: VerificationOutcome.INVALID,
        isAuthentic: false,
        credentialType: 'passport',
        message: 'The provided verification code format is invalid.',
      };
    }

    // 2. Hash normalized code for constant-time indexed lookup
    const codeHash = this.verificationCodeService.hashVerificationCode(rawCode);

    // 3. Query PostgreSQL passport record
    const passport = await this.prisma.passport.findUnique({
      where: { verificationCodeHash: codeHash },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!passport) {
      return {
        status: VerificationOutcome.NOT_FOUND,
        isAuthentic: false,
        credentialType: 'passport',
        message: 'No activity passport found matching the provided verification code.',
      };
    }

    // Parse summary counts if available (supports both enriched and legacy schemas)
    let summaryCounts: PassportSummaryCounts | undefined;
    let activitySnapshot: Array<{ id: string; type: string; title: string }> = [];

    if (passport.summaryJson && typeof passport.summaryJson === 'object') {
      const json = passport.summaryJson as Record<string, unknown>;
      const countsObj =
        json.counts && typeof json.counts === 'object'
          ? (json.counts as Record<string, unknown>)
          : json;

      if (
        typeof countsObj.eventsAttended === 'number' &&
        typeof countsObj.certificatesEarned === 'number' &&
        typeof countsObj.committeeTenures === 'number' &&
        typeof countsObj.totalActivities === 'number'
      ) {
        summaryCounts = {
          eventsAttended: countsObj.eventsAttended,
          certificatesEarned: countsObj.certificatesEarned,
          committeeTenures: countsObj.committeeTenures,
          totalActivities: countsObj.totalActivities,
        };
      }

      if (Array.isArray(json.activities)) {
        activitySnapshot = json.activities as Array<{ id: string; type: string; title: string }>;
      }
    }

    // 4. Revocation & Superseded Transparency
    if (passport.status === 'revoked') {
      return {
        status: VerificationOutcome.REVOKED,
        isAuthentic: false,
        credentialType: 'passport',
        passportNumber: passport.passportNumber,
        studentName: passport.user.name,
        revokedAt: passport.revokedAt ? passport.revokedAt.toISOString() : undefined,
        revocationReason:
          passport.revocationReason || 'Passport revoked by administrative authority.',
        message: 'This student activity passport was revoked and is no longer valid.',
      };
    }

    if (passport.status === 'superseded') {
      return {
        status: VerificationOutcome.REVOKED,
        isAuthentic: false,
        credentialType: 'passport',
        passportNumber: passport.passportNumber,
        studentName: passport.user.name,
        message: 'This activity passport has been superseded by a more recent dossier issuance.',
      };
    }

    // 5. Must be in active status
    if (passport.status !== 'active') {
      return {
        status: VerificationOutcome.NOT_FOUND,
        isAuthentic: false,
        credentialType: 'passport',
        message: 'Activity passport is not in an active or issued state.',
      };
    }

    // 6. Check if any underlying certificate in the historical snapshot has since been revoked
    let underlyingRevocationNotice: string | undefined;
    const certIds = activitySnapshot
      .filter((a) => a.type === 'certificate' || a.id.startsWith('cert-'))
      .map((a) => a.id.replace(/^cert-/, ''));

    if (certIds.length > 0) {
      const revokedCerts = await this.prisma.certificate.findMany({
        where: {
          id: { in: certIds },
          status: 'revoked',
        },
        select: { id: true },
      });

      if (revokedCerts.length > 0) {
        underlyingRevocationNotice = `Notice: ${revokedCerts.length} credential(s) included in this historical dossier snapshot were subsequently revoked.`;
      }
    }

    // 7. Document Tamper & Integrity Check (SHA-256 match against disk storage)
    if (passport.storagePath && passport.fileHash) {
      const integrityOk = await this.storageService.verifyFileIntegrity(
        passport.storagePath,
        passport.fileHash,
      );

      if (!integrityOk) {
        this.logger.warn(
          `Integrity verification failed for passport '${passport.id}'. File on disk has mismatched SHA-256 hash or is missing.`,
        );
        return {
          status: VerificationOutcome.INTEGRITY_MISMATCH,
          isAuthentic: false,
          credentialType: 'passport',
          passportNumber: passport.passportNumber,
          studentName: passport.user.name,
          message:
            'Security Warning: Document integrity check failed. The file has been modified or corrupted.',
        };
      }
    }

    // 7. Verified Authentic
    return {
      status: VerificationOutcome.VALID,
      isAuthentic: true,
      credentialType: 'passport',
      passportNumber: passport.passportNumber,
      studentName: passport.user.name,
      generatedAt: passport.generatedAt.toISOString(),
      issuingInstitution: 'Computer Society of India - GCET Student Branch',
      summaryCounts,
      message: underlyingRevocationNotice
        ? `Official CSI GCET Student Activity Passport is authentic. ${underlyingRevocationNotice}`
        : 'Official CSI GCET Student Activity Passport is authentic and verified.',
    };
  }

  /**
   * Administrative revocation of an issued passport.
   */
  async revokePassport(
    passportId: string,
    reason: string,
    adminUserId: string,
    clientIp: string,
  ): Promise<{ id: string; status: string; revokedAt: string }> {
    const passport = await this.prisma.passport.findUnique({
      where: { id: passportId },
    });

    if (!passport) {
      throw new NotFoundException({
        code: ErrorCode.PASSPORT_NOT_FOUND,
        message: `Passport with ID '${passportId}' was not found.`,
      });
    }

    if (passport.status === 'revoked') {
      throw new BadRequestException({
        code: ErrorCode.PASSPORT_REVOKED,
        message: 'This passport has already been revoked.',
      });
    }

    const now = new Date();

    const [updated] = await this.prisma.$transaction([
      this.prisma.passport.update({
        where: { id: passportId },
        data: {
          status: 'revoked',
          revokedAt: now,
          revocationReason: reason,
          revokedById: adminUserId,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminUserId,
          action: 'passport.revoked',
          targetType: 'passport',
          targetId: passport.id,
          beforeJson: {
            id: passport.id,
            status: passport.status,
            passportNumber: passport.passportNumber,
          },
          afterJson: {
            id: passport.id,
            status: 'revoked',
            revocationReason: reason,
            revokedAt: now.toISOString(),
          },
          ip: clientIp,
        },
      }),
    ]);

    this.logger.log(
      `Passport '${passport.id}' (${passport.passportNumber}) revoked by admin '${adminUserId}'.`,
    );

    return {
      id: updated.id,
      status: updated.status,
      revokedAt: now.toISOString(),
    };
  }
}

