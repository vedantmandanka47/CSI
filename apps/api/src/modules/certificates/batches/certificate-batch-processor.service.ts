import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { CertificateTemplateEngineService } from '../templates/certificate-template-engine.service.js';
import { CertificateStorageService } from '../storage/certificate-storage.service.js';
import { VerificationCodeService } from '../verification/verification-code.service.js';
import {
  CertificateTemplateConfig,
  CertificateData,
  BatchStatus,
  CertificateStatus,
  CertificateBatchResponse,
} from '@csi/shared';

@Injectable()
export class CertificateBatchProcessorService {
  private readonly logger = new Logger(CertificateBatchProcessorService.name);
  private readonly chunkSize = 10;
  private readonly activeWorkers = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: CertificateTemplateEngineService,
    private readonly storageService: CertificateStorageService,
    private readonly verificationCodeService: VerificationCodeService,
  ) {}

  /**
   * Dispatches asynchronous batch processing in the background without blocking the HTTP request.
   */
  dispatchBatch(batchId: string): void {
    setImmediate(async () => {
      try {
        await this.processBatch(batchId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Background worker failed for batch '${batchId}': ${msg}`);
      }
    });
  }

  /**
   * Executes batch certificate generation in memory-bounded chunks with failure isolation.
   * If an active worker is already running for the batch, returns the active worker promise.
   */
  async processBatch(batchId: string): Promise<void> {
    const existing = this.activeWorkers.get(batchId);
    if (existing) {
      this.logger.log(`Batch '${batchId}' is already being processed. Awaiting active worker.`);
      return existing;
    }

    const workerPromise = this.executeBatch(batchId);
    this.activeWorkers.set(batchId, workerPromise);

    try {
      await workerPromise;
    } finally {
      this.activeWorkers.delete(batchId);
    }
  }

  /**
   * Internal execution logic for chunked certificate processing.
   */
  private async executeBatch(batchId: string): Promise<void> {
    try {
      // 1. Concurrency control: Atomic state transition from 'pending' or 'partially_completed' to 'processing'
      const updated = await this.prisma.certificateBatch.updateMany({
        where: {
          id: batchId,
          status: { in: [BatchStatus.PENDING, BatchStatus.PARTIALLY_COMPLETED] },
        },
        data: {
          status: BatchStatus.PROCESSING,
        },
      });

      if (updated.count === 0) {
        this.logger.log(`Batch '${batchId}' was already picked up or is not in processable state.`);
        return;
      }

      const batch = await this.prisma.certificateBatch.findUnique({
        where: { id: batchId },
        include: { event: true },
      });

      if (!batch) {
        throw new NotFoundException(`Certificate batch '${batchId}' not found.`);
      }

      const templateConfig = batch.templateConfig as unknown as CertificateTemplateConfig;

      // 2. Process pending certificates in chunks to control memory
      while (true) {
        const pendingCertificates = await this.prisma.certificate.findMany({
          where: {
            batchId,
            status: CertificateStatus.PENDING,
          },
          take: this.chunkSize,
        });

        if (pendingCertificates.length === 0) {
          break;
        }

        for (const cert of pendingCertificates) {
          try {
            // Mark certificate processing
            await this.prisma.certificate.update({
              where: { id: cert.id },
              data: { status: CertificateStatus.PROCESSING },
            });

            // Generate high-entropy Crockford Base32 verification code (M13)
            const rawVerificationCode = this.verificationCodeService.generateVerificationCode();
            const formattedVerificationCode =
              this.verificationCodeService.formatVerificationCode(rawVerificationCode);
            const verificationCodeHash =
              this.verificationCodeService.hashVerificationCode(rawVerificationCode);
            const verificationUrl =
              this.verificationCodeService.buildVerificationUrl(formattedVerificationCode);

            const certData: CertificateData = {
              recipient_name: cert.recipientName,
              recipient_id: cert.recipientId || cert.id,
              event_title: batch.event.title,
              event_category: batch.event.category,
              issue_date: cert.issueDate,
              achievement: cert.achievement || undefined,
              certificate_number: cert.certificateNumber,
              verification_code: formattedVerificationCode,
              verification_url: verificationUrl,
              college_name: 'GCET Engineering College',
              custom_placeholders:
                typeof cert.metadata === 'object' && cert.metadata !== null
                  ? (cert.metadata as Record<string, string>)
                  : undefined,
            };

            // Render PDF via M11 Pure JS Engine
            const rendered = await this.templateEngine.renderCertificate(
              templateConfig,
              certData,
            );

            // Persist to safe disk storage
            const savedFile = await this.storageService.saveCertificatePdf(
              cert.id,
              rendered.pdfBuffer,
              batchId,
            );

            // Mark certificate generated with anti-forgery verification hash
            await this.prisma.certificate.update({
              where: { id: cert.id },
              data: {
                status: CertificateStatus.GENERATED,
                verificationCodeHash,
                storagePath: savedFile.storagePath,
                fileHash: savedFile.fileHash,
                fileSizeBytes: savedFile.fileSizeBytes,
                errorReason: null,
                issuedAt: new Date(),
              },
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `Failed generating certificate '${cert.id}' for '${cert.recipientEmail}': ${errorMsg}`,
            );

            await this.prisma.certificate.update({
              where: { id: cert.id },
              data: {
                status: CertificateStatus.FAILED,
                errorReason: errorMsg,
                retryCount: { increment: 1 },
              },
            });
          }
        }
      }

      // 3. Finalize batch summary status
      await this.finalizeBatchStatus(batchId);
    } finally {
      this.activeWorkers.delete(batchId);
    }
  }

  /**
   * Retries all eligible failed certificates within a batch.
   */
  async retryBatch(batchId: string, maxRetries: number = 3): Promise<CertificateBatchResponse> {
    const batch = await this.prisma.certificateBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch '${batchId}' not found.`);
    }

    const eligibleFailed = await this.prisma.certificate.findMany({
      where: {
        batchId,
        status: CertificateStatus.FAILED,
        retryCount: { lt: maxRetries },
      },
    });

    if (eligibleFailed.length === 0) {
      throw new BadRequestException(
        `No eligible failed certificates found for retry (max retries: ${maxRetries}).`,
      );
    }

    // Reset eligible certificates to pending
    await this.prisma.certificate.updateMany({
      where: {
        id: { in: eligibleFailed.map((c) => c.id) },
      },
      data: {
        status: CertificateStatus.PENDING,
        errorReason: null,
      },
    });

    // Mark batch processing
    await this.prisma.certificateBatch.update({
      where: { id: batchId },
      data: {
        status: BatchStatus.PROCESSING,
        failureReason: null,
      },
    });

    // Dispatch background processor
    this.dispatchBatch(batchId);

    return this.getBatchProgress(batchId);
  }

  /**
   * Finalizes the state and progress counts of a completed batch.
   */
  private async finalizeBatchStatus(batchId: string): Promise<void> {
    const certificates = await this.prisma.certificate.findMany({
      where: { batchId },
      select: { status: true },
    });

    const totalCount = certificates.length;
    const successCount = certificates.filter((c) => c.status === CertificateStatus.GENERATED).length;
    const failedCount = certificates.filter((c) => c.status === CertificateStatus.FAILED).length;

    let finalStatus: BatchStatus = BatchStatus.COMPLETED;
    let failureReason: string | null = null;

    if (failedCount > 0 && successCount > 0) {
      finalStatus = BatchStatus.PARTIALLY_COMPLETED;
      failureReason = `${failedCount} of ${totalCount} certificates encountered errors during generation.`;
    } else if (failedCount > 0 && successCount === 0) {
      finalStatus = BatchStatus.FAILED;
      failureReason = `All ${failedCount} certificates failed during generation.`;
    }

    await this.prisma.certificateBatch.update({
      where: { id: batchId },
      data: {
        status: finalStatus,
        totalCount,
        successCount,
        failedCount,
        failureReason,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Computes the real-time progress and status of a batch.
   */
  async getBatchProgress(batchId: string): Promise<CertificateBatchResponse> {
    const batch = await this.prisma.certificateBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Batch with ID '${batchId}' was not found.`);
    }

    const certCounts = await this.prisma.certificate.groupBy({
      by: ['status'],
      where: { batchId },
      _count: { status: true },
    });

    let success = 0;
    let failed = 0;
    let pending = 0;
    let processing = 0;

    for (const group of certCounts) {
      if (group.status === CertificateStatus.GENERATED) success += group._count.status;
      if (group.status === CertificateStatus.FAILED) failed += group._count.status;
      if (group.status === CertificateStatus.PENDING) pending += group._count.status;
      if (group.status === CertificateStatus.PROCESSING) processing += group._count.status;
    }

    const total = batch.totalCount || (success + failed + pending + processing);
    const progressPercent = total > 0 ? Math.round(((success + failed) / total) * 100) : 0;

    return {
      id: batch.id,
      eventId: batch.eventId,
      templateId: batch.templateId,
      certificateType: batch.certificateType,
      status: batch.status as BatchStatus,
      totalCount: total,
      successCount: success,
      failedCount: failed,
      progressPercent,
      createdById: batch.createdById,
      failureReason: batch.failureReason,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      completedAt: batch.completedAt ? batch.completedAt.toISOString() : null,
    };
  }
}

