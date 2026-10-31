import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ParticipantResolverService } from './participant-resolver.service.js';
import { CertificateNumberGeneratorService } from './certificate-number-generator.service.js';
import { CertificateTemplateEngineService } from './certificate-template-engine.service.js';
import { CertificateBatchProcessorService } from './certificate-batch-processor.service.js';
import { CertificateStorageService } from './certificate-storage.service.js';
import {
  CreateCertificateBatchInput,
  CertificateBatchResponse,
  CertificateQuery,
  CertificateDetail,
  BatchStatus,
  CertificateStatus,
  CertificateType,
  CurrentUser,
  PermissionCode,
} from '@csi/shared';
import { createHash } from 'crypto';

@Injectable()
export class CertificateIssuanceService {
  private readonly logger = new Logger(CertificateIssuanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly participantResolver: ParticipantResolverService,
    private readonly numberGenerator: CertificateNumberGeneratorService,
    private readonly templateEngine: CertificateTemplateEngineService,
    private readonly batchProcessor: CertificateBatchProcessorService,
    private readonly storageService: CertificateStorageService,
  ) {}

  /**
   * Creates an idempotent certificate batch and dispatches async background processing.
   */
  async createBatch(
    input: CreateCertificateBatchInput,
    actorId: string,
    clientIp?: string,
  ): Promise<CertificateBatchResponse> {
    // 1. Idempotency Check (Idempotency-Key header)
    if (input.idempotencyKey) {
      const existingKey = await this.prisma.idempotencyKey.findUnique({
        where: { key: input.idempotencyKey },
      });

      if (existingKey && existingKey.response) {
        this.logger.log(`Returning cached response for idempotency key '${input.idempotencyKey}'`);
        return existingKey.response as unknown as CertificateBatchResponse;
      }
    }

    // 2. Event Existence & Details
    const event = await this.prisma.event.findUnique({
      where: { id: input.eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${input.eventId}' was not found.`);
    }

    // 3. Resolve Template Configuration
    let templateConfig = input.templateConfig;
    if (templateConfig) {
      templateConfig = this.templateEngine.validateTemplate(templateConfig);
    } else if (input.templateId === 'csi-default-merit' || input.certificateType === CertificateType.MERIT) {
      templateConfig = CertificateTemplateEngineService.DEFAULT_CSI_MERIT_TEMPLATE;
    } else {
      templateConfig = CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE;
    }

    // 4. Resolve Eligible Participants
    const participants = await this.participantResolver.resolveEligibleParticipants(
      input.eventId,
      input.eligibilityMode,
      input.recipients,
    );

    if (participants.length === 0) {
      throw new BadRequestException(
        `No eligible participants found for event '${event.title}' under criteria '${input.eligibilityMode}'.`,
      );
    }

    // 5. Check for already issued certificates (Duplicate Prevention)
    const existingCerts = await this.prisma.certificate.findMany({
      where: {
        eventId: input.eventId,
        certificateType: input.certificateType,
        recipientEmail: { in: participants.map((p) => p.recipientEmail) },
      },
      select: { recipientEmail: true, status: true },
    });

    const existingEmails = new Set(
      existingCerts.map((c) => c.recipientEmail.toLowerCase().trim()),
    );

    // Filter out participants who already have a completed or pending certificate for this event & type
    const eligibleToCreate = participants.filter(
      (p) => !existingEmails.has(p.recipientEmail.toLowerCase().trim()),
    );

    if (eligibleToCreate.length === 0) {
      throw new BadRequestException(
        `All ${participants.length} eligible participants already have a certificate of type '${input.certificateType}' for this event.`,
      );
    }

    const issueDate =
      input.issueDate ||
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

    // 6. Transactional Batch and Certificate Records Creation
    const { batch, createdCount } = await this.prisma.$transaction(async (tx) => {
      const newBatch = await tx.certificateBatch.create({
        data: {
          eventId: input.eventId,
          templateId: input.templateId,
          templateConfig: templateConfig as any,
          certificateType: input.certificateType,
          status: BatchStatus.PENDING,
          totalCount: eligibleToCreate.length,
          successCount: 0,
          failedCount: 0,
          createdById: actorId,
        },
      });

      const certRecords = eligibleToCreate.map((p) => {
        const certNumber = this.numberGenerator.generateCertificateNumber(
          event.slug,
          p.recipientEmail,
          input.certificateType,
        );

        return {
          batchId: newBatch.id,
          eventId: input.eventId,
          recipientType: p.recipientType,
          recipientId: p.recipientId,
          recipientEmail: p.recipientEmail,
          recipientName: p.recipientName,
          certificateType: input.certificateType,
          certificateNumber: certNumber,
          issueDate,
          achievement: p.achievement,
          metadata: p.customPlaceholders ? (p.customPlaceholders as any) : undefined,
          status: CertificateStatus.PENDING,
        };
      });

      // Insert certificate records in bulk
      await tx.certificate.createMany({
        data: certRecords,
        skipDuplicates: true,
      });

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'CERTIFICATE_BATCH_CREATED',
          targetType: 'certificate_batch',
          targetId: newBatch.id,
          ip: clientIp,
          afterJson: {
            batch_id: newBatch.id,
            event_id: input.eventId,
            event_title: event.title,
            certificate_type: input.certificateType,
            recipient_count: eligibleToCreate.length,
            eligibility_mode: input.eligibilityMode,
          },
        },
      });

      return { batch: newBatch, createdCount: eligibleToCreate.length };
    });

    const response: CertificateBatchResponse = {
      id: batch.id,
      eventId: batch.eventId,
      templateId: batch.templateId,
      certificateType: batch.certificateType,
      status: BatchStatus.PENDING,
      totalCount: createdCount,
      successCount: 0,
      failedCount: 0,
      progressPercent: 0,
      createdById: batch.createdById,
      failureReason: null,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      completedAt: null,
    };

    // Store Idempotency Key response if requested
    if (input.idempotencyKey) {
      const requestHash = createHash('sha256')
        .update(JSON.stringify(input))
        .digest('hex');

      await this.prisma.idempotencyKey.upsert({
        where: { key: input.idempotencyKey },
        update: {
          response: response as any,
          statusCode: 201,
        },
        create: {
          key: input.idempotencyKey,
          userId: actorId,
          route: '/api/certificates/batches',
          requestHash,
          response: response as any,
          statusCode: 201,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours TTL
        },
      });
    }

    // 7. Dispatch Asynchronous Background Processing
    this.batchProcessor.dispatchBatch(batch.id);

    return response;
  }

  /**
   * Retrieves batch details and current progress.
   */
  async getBatchDetails(batchId: string): Promise<CertificateBatchResponse> {
    return this.batchProcessor.getBatchProgress(batchId);
  }

  /**
   * Lists certificate batches with pagination.
   */
  async listBatches(eventId?: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const where = eventId ? { eventId } : {};

    const [batches, total] = await Promise.all([
      this.prisma.certificateBatch.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { id: true, title: true, slug: true } },
        },
      }),
      this.prisma.certificateBatch.count({ where }),
    ]);

    return {
      batches: batches.map((b) => ({
        id: b.id,
        eventId: b.eventId,
        eventTitle: b.event.title,
        templateId: b.templateId,
        certificateType: b.certificateType,
        status: b.status,
        totalCount: b.totalCount,
        successCount: b.successCount,
        failedCount: b.failedCount,
        progressPercent:
          b.totalCount > 0 ? Math.round(((b.successCount + b.failedCount) / b.totalCount) * 100) : 0,
        createdAt: b.createdAt.toISOString(),
        completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lists certificates within a batch.
   */
  async listBatchCertificates(batchId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const where = { batchId };

    const [certificates, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return {
      certificates: certificates.map(this.mapCertificateDetail),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Queries certificates with filters and pagination.
   */
  async queryCertificates(query: CertificateQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.eventId) where.eventId = query.eventId;
    if (query.batchId) where.batchId = query.batchId;
    if (query.status) where.status = query.status;
    if (query.recipientEmail) where.recipientEmail = query.recipientEmail.toLowerCase().trim();
    if (query.search) {
      where.OR = [
        { recipientName: { contains: query.search, mode: 'insensitive' } },
        { certificateNumber: { contains: query.search, mode: 'insensitive' } },
        { recipientEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [certificates, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return {
      certificates: certificates.map(this.mapCertificateDetail),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves certificate for download with strict authorization checks.
   */
  async getCertificateDownload(
    certificateId: string,
    currentUser?: CurrentUser,
  ): Promise<{ pdfBuffer: Buffer; filename: string }> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        event: true,
        batch: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException(`Certificate with ID '${certificateId}' was not found.`);
    }

    // Authorization check:
    // User must either hold `cert.generate` permission (admin/organizer) OR be the certificate recipient
    const hasGeneratePerm = currentUser?.permissions?.includes(PermissionCode.CERT_GENERATE);
    const isOwner =
      currentUser &&
      ((certificate.recipientId && currentUser.id === certificate.recipientId) ||
        (certificate.recipientEmail &&
          currentUser.email?.toLowerCase() === certificate.recipientEmail.toLowerCase()));

    if (!hasGeneratePerm && !isOwner) {
      throw new ForbiddenException('You are not authorized to download this certificate.');
    }

    // If PDF is already stored on disk, retrieve it
    if (certificate.storagePath && this.storageService.hasCertificatePdf(certificate.storagePath)) {
      const pdfBuffer = await this.storageService.getCertificatePdf(certificate.storagePath);
      const safeRecipient = certificate.recipientName.replace(/[^a-zA-Z0-9_\-]/g, '_');
      return {
        pdfBuffer,
        filename: `certificate-${safeRecipient}.pdf`,
      };
    }

    // Fallback: If certificate record is generated but file was moved/ephemeral, regenerate deterministically
    const templateConfig = certificate.batch?.templateConfig
      ? (certificate.batch.templateConfig as any)
      : CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE;

    const certData = {
      recipient_name: certificate.recipientName,
      recipient_id: certificate.recipientId || certificate.id,
      event_title: certificate.event.title,
      event_category: certificate.event.category,
      issue_date: certificate.issueDate,
      achievement: certificate.achievement || undefined,
      certificate_number: certificate.certificateNumber,
      college_name: 'GCET Engineering College',
      custom_placeholders:
        typeof certificate.metadata === 'object' && certificate.metadata !== null
          ? (certificate.metadata as Record<string, string>)
          : undefined,
    };

    const rendered = await this.templateEngine.renderCertificate(templateConfig, certData);

    // Save regenerated PDF back to storage
    await this.storageService.saveCertificatePdf(
      certificate.id,
      rendered.pdfBuffer,
      certificate.batchId || undefined,
    );

    const safeRecipient = certificate.recipientName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return {
      pdfBuffer: rendered.pdfBuffer,
      filename: `certificate-${safeRecipient}.pdf`,
    };
  }

  /**
   * Retrieves all certificates issued to an authenticated user.
   */
  async listUserCertificates(userId: string, email: string) {
    const certificates = await this.prisma.certificate.findMany({
      where: {
        OR: [
          { recipientId: userId },
          { recipientEmail: email.toLowerCase().trim() },
        ],
        status: CertificateStatus.GENERATED,
      },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return certificates.map((c) => ({
      id: c.id,
      eventId: c.eventId,
      eventTitle: c.event.title,
      eventSlug: c.event.slug,
      certificateType: c.certificateType,
      certificateNumber: c.certificateNumber,
      issueDate: c.issueDate,
      achievement: c.achievement,
      issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /**
   * Maps Prisma Certificate to CertificateDetail DTO.
   */
  private mapCertificateDetail(c: any): CertificateDetail {
    return {
      id: c.id,
      batchId: c.batchId,
      eventId: c.eventId,
      recipientType: c.recipientType,
      recipientId: c.recipientId,
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
