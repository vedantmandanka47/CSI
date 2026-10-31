import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { VerificationCodeService } from './verification-code.service.js';
import { CertificateStorageService } from './certificate-storage.service.js';
import {
  VerificationOutcome,
  PublicCertificateVerificationResponse,
  CertificateDetail,
  CertificateStatus,
} from '@csi/shared';

@Injectable()
export class CertificateVerificationService {
  private readonly logger = new Logger(CertificateVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationCodeService: VerificationCodeService,
    private readonly storageService: CertificateStorageService,
  ) {}

  /**
   * Public, unauthenticated verification of a certificate by verification code.
   * Privacy-preserving: Returns only public verification fields, strictly redacting
   * email, phone, enrollment number, internal IDs, and storage paths.
   */
  async verifyCertificate(rawCode: string): Promise<PublicCertificateVerificationResponse> {
    if (!rawCode || typeof rawCode !== 'string') {
      return {
        status: VerificationOutcome.INVALID,
        isAuthentic: false,
        message: 'The provided verification code format is invalid.',
      };
    }

    // 1. Syntactic Crockford Base32 check
    if (!this.verificationCodeService.isValidCode(rawCode)) {
      return {
        status: VerificationOutcome.INVALID,
        isAuthentic: false,
        message: 'The provided verification code format is invalid.',
      };
    }

    // 2. Hash normalized code for constant-time indexed lookup
    const codeHash = this.verificationCodeService.hashVerificationCode(rawCode);

    // 3. Query PostgreSQL certificate record
    const certificate = await this.prisma.certificate.findUnique({
      where: { verificationCodeHash: codeHash },
      include: {
        event: {
          select: {
            title: true,
          },
        },
      },
    });

    if (!certificate) {
      return {
        status: VerificationOutcome.NOT_FOUND,
        isAuthentic: false,
        message: 'No certificate found matching the provided verification code.',
      };
    }

    // 4. Revocation Transparency
    if (certificate.status === CertificateStatus.REVOKED) {
      return {
        status: VerificationOutcome.REVOKED,
        isAuthentic: false,
        certificateNumber: certificate.certificateNumber,
        certificateType: certificate.certificateType,
        recipientName: certificate.recipientName,
        eventName: certificate.event.title,
        revokedAt: certificate.revokedAt ? certificate.revokedAt.toISOString() : undefined,
        revocationReason:
          certificate.revocationReason || 'Certificate revoked by administrative authority.',
        message: 'This certificate was revoked and is no longer valid.',
      };
    }

    // 5. Must be in GENERATED status
    if (certificate.status !== CertificateStatus.GENERATED) {
      return {
        status: VerificationOutcome.NOT_FOUND,
        isAuthentic: false,
        message: 'Certificate is not currently in an active or issued state.',
      };
    }

    // 6. Document Tamper & Integrity Check (SHA-256 match against disk storage)
    if (certificate.storagePath && certificate.fileHash) {
      const integrityOk = await this.storageService.verifyFileIntegrity(
        certificate.storagePath,
        certificate.fileHash,
      );

      if (!integrityOk) {
        this.logger.warn(
          `Integrity mismatch detected during verification for certificate '${certificate.id}' (${certificate.certificateNumber})`,
        );
        return {
          status: VerificationOutcome.INTEGRITY_MISMATCH,
          isAuthentic: false,
          message: 'Certificate integrity check failed. The document has been modified or corrupted.',
        };
      }
    }

    // 7. Authentic Verification Result
    return {
      status: VerificationOutcome.VALID,
      isAuthentic: true,
      certificateNumber: certificate.certificateNumber,
      certificateType: certificate.certificateType,
      recipientName: certificate.recipientName,
      eventName: certificate.event.title,
      issueDate: certificate.issueDate,
      issuedAt: certificate.issuedAt
        ? certificate.issuedAt.toISOString()
        : certificate.createdAt.toISOString(),
      issuingInstitution: 'Computer Society of India - GCET Student Branch',
    };
  }

  /**
   * Revokes an issued certificate with mandatory justification, recording an immutable audit log.
   * Handled idempotently for repeated revocation requests.
   */
  async revokeCertificate(
    certificateId: string,
    reason: string,
    actorId: string,
    clientIp?: string,
  ): Promise<CertificateDetail> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Revocation reason must be at least 5 characters.');
    }

    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: { event: true },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found.');
    }

    // Idempotent: If already revoked, return without duplicate audit logging
    if (certificate.status === CertificateStatus.REVOKED) {
      return this.mapCertificateDetail(certificate);
    }

    // Perform atomic revocation and audit log entry
    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.certificate.update({
        where: { id: certificateId },
        data: {
          status: CertificateStatus.REVOKED,
          revokedAt: new Date(),
          revocationReason: reason.trim(),
          revokedById: actorId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'certificate.revoked',
          actorId,
          targetType: 'certificate',
          targetId: certificateId,
          beforeJson: {
            status: certificate.status,
            certificateNumber: certificate.certificateNumber,
          },
          afterJson: {
            status: CertificateStatus.REVOKED,
            revocationReason: reason.trim(),
            eventId: certificate.eventId,
            recipientEmail: certificate.recipientEmail,
          },
          ip: clientIp || '127.0.0.1',
        },
      });

      return updated;
    });

    return this.mapCertificateDetail(revoked);
  }

  /**
   * Helper to map Prisma Certificate entity to CertificateDetail.
   */
  private mapCertificateDetail(c: any): CertificateDetail {
    return {
      id: c.id,
      batchId: c.batchId,
      eventId: c.eventId,
      recipientType: c.recipientType || 'member',
      recipientEmail: c.recipientEmail,
      recipientName: c.recipientName,
      certificateType: c.certificateType,
      certificateNumber: c.certificateNumber,
      issueDate: c.issueDate,
      achievement: c.achievement,
      status: c.status,
      fileSizeBytes: c.fileSizeBytes,
      errorReason: c.errorReason,
      retryCount: c.retryCount,
      issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
