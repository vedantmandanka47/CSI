import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { PassportAggregationService } from './passport-aggregation.service.js';
import { PassportPdfService } from './passport-pdf.service.js';
import { PassportStorageService } from './passport-storage.service.js';
import { VerificationCodeService } from '../../certificates/verification/verification-code.service.js';
import { CurrentUser, PermissionCode, ErrorCode } from '@csi/shared';
import { env } from '../../../config/env.js';

@Injectable()
export class PassportExportService {
  private readonly logger = new Logger(PassportExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregationService: PassportAggregationService,
    private readonly pdfService: PassportPdfService,
    private readonly storageService: PassportStorageService,
    private readonly verificationCodeService: VerificationCodeService,
  ) {}

  /**
   * Generates a new verified, tamper-evident passport PDF dossier.
   */
  async exportPassport(
    userId: string,
    currentUser: CurrentUser,
  ): Promise<{ passportId: string; passportNumber: string; pdfBuffer: Buffer; filename: string }> {
    // Authorization check
    const isOwner = currentUser.id === userId;
    const hasAdminPerm =
      currentUser.permissions.includes(PermissionCode.EXPORT_DATA) ||
      currentUser.permissions.includes(PermissionCode.ROSTER_MANAGE);

    if (!isOwner && !hasAdminPerm) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not authorized to export this activity passport.',
      });
    }

    // 1. Aggregate authoritative verified student achievements
    const passportData = await this.aggregationService.getStudentPassport(userId);

    // 2. Generate unique identifiers and cryptographic verification references
    const year = new Date().getFullYear();
    const entropyHex = randomBytes(3).toString('hex').toUpperCase();
    const passportNumber = `CSI-PASS-${year}-${entropyHex}`;

    const rawVerificationCode = this.verificationCodeService.generateVerificationCode();
    const formattedVerificationCode =
      this.verificationCodeService.formatVerificationCode(rawVerificationCode);
    const verificationCodeHash =
      this.verificationCodeService.hashVerificationCode(rawVerificationCode);

    const baseUrl = env.PUBLIC_APP_URL || 'http://localhost:3000';
    const verificationUrl = `${baseUrl}/verify/${rawVerificationCode}`;

    // 3. Render PDF Dossier
    const rendered = await this.pdfService.generatePassportPdf(
      passportData,
      passportNumber,
      formattedVerificationCode,
      verificationUrl,
    );

    // 4. Mark earlier active passports for this student as 'superseded' to preserve historical snapshot
    await this.prisma.passport.updateMany({
      where: {
        userId: passportData.student.id,
        status: 'active',
      },
      data: {
        status: 'superseded',
      },
    });

    // 5. Create Passport Record in Database with full activity snapshot
    const passportRecord = await this.prisma.passport.create({
      data: {
        userId: passportData.student.id,
        passportNumber,
        status: 'active',
        fileHash: rendered.fileHash,
        fileSizeBytes: rendered.pdfBuffer.length,
        verificationCodeHash,
        summaryJson: {
          counts: passportData.summary,
          activities: passportData.activities.map((a) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            category: a.category,
            date: a.date,
            verificationStatus: a.verificationStatus,
          })),
          snapshotAt: new Date().toISOString(),
          version: 1,
        },
        generatedAt: new Date(),
      },
    });

    // 5. Persist PDF to safe disk storage
    const savedFile = await this.storageService.savePassportPdf(
      passportRecord.id,
      rendered.pdfBuffer,
    );

    // Update with relative storage path
    await this.prisma.passport.update({
      where: { id: passportRecord.id },
      data: {
        storagePath: savedFile.storagePath,
      },
    });

    this.logger.log(
      `Generated Activity Passport '${passportRecord.id}' (${passportNumber}) for student '${passportData.student.name}'`,
    );

    const safeName = passportData.student.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      passportId: passportRecord.id,
      passportNumber,
      pdfBuffer: rendered.pdfBuffer,
      filename: `passport-${safeName}.pdf`,
    };
  }

  /**
   * Retrieves an issued passport PDF with mandatory tamper-detection check.
   */
  async getPassportDownload(
    passportId: string,
    currentUser: CurrentUser,
  ): Promise<{ pdfBuffer: Buffer; filename: string }> {
    const passport = await this.prisma.passport.findUnique({
      where: { id: passportId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!passport) {
      throw new NotFoundException({
        code: ErrorCode.PASSPORT_NOT_FOUND,
        message: `Passport with ID '${passportId}' was not found.`,
      });
    }

    // Authorization check
    const isOwner = currentUser.id === passport.userId;
    const hasAdminPerm =
      currentUser.permissions.includes(PermissionCode.EXPORT_DATA) ||
      currentUser.permissions.includes(PermissionCode.ROSTER_MANAGE);

    if (!isOwner && !hasAdminPerm) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not authorized to download this activity passport.',
      });
    }

    // 1. Missing File Detection
    if (!passport.storagePath || !this.storageService.hasPassportPdf(passport.storagePath)) {
      this.logger.error(
        `Passport PDF file is missing from storage for passport '${passport.id}'.`,
      );
      throw new ConflictException({
        code: ErrorCode.PASSPORT_FILE_UNAVAILABLE,
        message:
          'The activity passport file is currently unavailable in storage. Please regenerate your dossier.',
      });
    }

    // 2. Document Integrity Check (SHA-256)
    if (passport.fileHash) {
      const integrityOk = await this.storageService.verifyFileIntegrity(
        passport.storagePath,
        passport.fileHash,
      );

      if (!integrityOk) {
        this.logger.warn(
          `Integrity verification failed on download for passport '${passport.id}'.`,
        );
        throw new ConflictException({
          code: ErrorCode.PASSPORT_INTEGRITY_MISMATCH,
          message:
            'Passport document integrity check failed. The stored file has been modified or corrupted.',
        });
      }
    }

    // 3. Retrieve Buffer
    const pdfBuffer = await this.storageService.getPassportPdf(passport.storagePath);
    const safeName = passport.user.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    return {
      pdfBuffer,
      filename: `passport-${safeName}.pdf`,
    };
  }

  /**
   * Downloads the latest generated passport PDF for a user.
   */
  async getLatestPassportDownload(
    userId: string,
    currentUser: CurrentUser,
  ): Promise<{ pdfBuffer: Buffer; filename: string }> {
    const isOwner = currentUser.id === userId;
    const hasAdminPerm =
      currentUser.permissions.includes(PermissionCode.EXPORT_DATA) ||
      currentUser.permissions.includes(PermissionCode.ROSTER_MANAGE);

    if (!isOwner && !hasAdminPerm) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not authorized to download this activity passport.',
      });
    }

    const latestPassport = await this.prisma.passport.findFirst({
      where: {
        userId,
        status: 'active',
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });

    if (!latestPassport) {
      // If no passport has been generated yet, generate one on demand
      const generated = await this.exportPassport(userId, currentUser);
      return {
        pdfBuffer: generated.pdfBuffer,
        filename: generated.filename,
      };
    }

    return this.getPassportDownload(latestPassport.id, currentUser);
  }
}
