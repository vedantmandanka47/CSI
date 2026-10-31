import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  PermissionCode,
  ValidateTemplateInputSchema,
  RenderCertificateInputSchema,
  CertificateTemplateConfigSchema,
  type CertificateData,
  CreateCertificateBatchInputSchema,
  CertificateQuerySchema,
  RetryBatchInputSchema,
  CurrentUser,
} from '@csi/shared';
import {
  RequirePermission,
  Authenticated,
  ReqUser,
} from '../../../common/decorators/index.js';
import { CertificateTemplateEngineService } from '../templates/certificate-template-engine.service.js';
import { CertificateIssuanceService } from '../issuance/certificate-issuance.service.js';
import { CertificateBatchProcessorService } from '../batches/certificate-batch-processor.service.js';

@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificateEngine: CertificateTemplateEngineService,
    private readonly issuanceService: CertificateIssuanceService,
    private readonly batchProcessor: CertificateBatchProcessorService,
  ) {}

  /**
   * Returns official default CSI certificate templates.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Get('templates/default')
  getDefaultTemplates() {
    return {
      participation: CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
      merit: CertificateTemplateEngineService.DEFAULT_CSI_MERIT_TEMPLATE,
    };
  }

  /**
   * Returns list of supported standard PDF font families and styles.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Get('fonts')
  getSupportedFonts() {
    return [
      {
        family: 'Helvetica',
        styles: ['normal', 'bold', 'italic', 'bold-italic'],
        isStandard: true,
      },
      {
        family: 'Times-Roman',
        styles: ['normal', 'bold', 'italic', 'bold-italic'],
        isStandard: true,
      },
      {
        family: 'Courier',
        styles: ['normal', 'bold', 'italic', 'bold-italic'],
        isStandard: true,
      },
    ];
  }

  /**
   * Validates a candidate certificate template against the formal schema.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @HttpCode(HttpStatus.OK)
  @Post('templates/validate')
  validateTemplate(@Body() body: unknown) {
    const parseResult = ValidateTemplateInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'TEMPLATE_VALIDATION_ERROR',
        message: 'Invalid certificate template configuration',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return {
      valid: true,
      template: parseResult.data.template,
    };
  }

  /**
   * Generates a preview PDF buffer for testing and editing layouts.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @HttpCode(HttpStatus.OK)
  @Post('preview')
  async previewCertificate(
    @Body() body: { template?: unknown; data?: Partial<CertificateData> },
    @Res() res: Response,
  ) {
    if (!body || !body.template) {
      throw new BadRequestException('Template configuration is required for preview.');
    }

    const templateResult = CertificateTemplateConfigSchema.safeParse(body.template);
    if (!templateResult.success) {
      throw new BadRequestException({
        code: 'TEMPLATE_VALIDATION_ERROR',
        message: 'Invalid certificate template configuration',
        fields: templateResult.error.flatten().fieldErrors,
      });
    }

    const sampleData: CertificateData = {
      recipient_name: body.data?.recipient_name ?? 'John Doe',
      recipient_id: body.data?.recipient_id ?? 'CSI-2026-M-001',
      event_title: body.data?.event_title ?? 'Annual National Technical Symposium 2026',
      event_category: body.data?.event_category ?? 'WORKSHOP',
      issue_date: body.data?.issue_date ?? 'October 31, 2026',
      achievement: body.data?.achievement ?? 'First Prize',
      certificate_number: body.data?.certificate_number ?? 'CSI-PREVIEW-SAMPLE-001',
      college_name: body.data?.college_name ?? 'GCET Engineering College',
      custom_placeholders: body.data?.custom_placeholders ?? {},
    };

    const rendered = await this.certificateEngine.renderCertificate(
      templateResult.data,
      sampleData,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="certificate-preview.pdf"');
    res.setHeader('Content-Length', rendered.pdfBuffer.length);
    return res.status(HttpStatus.OK).send(rendered.pdfBuffer);
  }

  /**
   * Renders and downloads a finalized certificate PDF for given participant data.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @HttpCode(HttpStatus.OK)
  @Post('render')
  async renderCertificate(
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    const parseResult = RenderCertificateInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid render certificate request payload',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const { template, data } = parseResult.data;
    const rendered = await this.certificateEngine.renderCertificate(template, data);

    const safeName = data.recipient_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${safeName}.pdf"`);
    res.setHeader('Content-Length', rendered.pdfBuffer.length);
    return res.status(HttpStatus.OK).send(rendered.pdfBuffer);
  }

  // =========================================================================
  // M12: Batch Certificate Generation & Idempotency Endpoints
  // =========================================================================

  /**
   * Initiates an idempotent batch certificate generation process.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Post('batches')
  async createBatch(
    @Body() body: unknown,
    @ReqUser() currentUser: CurrentUser,
    @Headers('idempotency-key') idempotencyHeader?: string,
    @Req() req?: Request,
  ) {
    const parseResult = CreateCertificateBatchInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid certificate batch request payload',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    const input = parseResult.data;
    if (idempotencyHeader && !input.idempotencyKey) {
      input.idempotencyKey = idempotencyHeader.trim();
    }

    const clientIp = req?.ip || req?.socket?.remoteAddress;
    return this.issuanceService.createBatch(input, currentUser.id, clientIp);
  }

  /**
   * Lists certificate batches with optional event filtering and pagination.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Get('batches')
  async listBatches(
    @Query('eventId') eventId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.issuanceService.listBatches(eventId, pageNum, limitNum);
  }

  /**
   * Retrieves status, metrics, and progress for a specific certificate batch.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Get('batches/:id')
  async getBatchDetails(@Param('id') id: string) {
    return this.issuanceService.getBatchDetails(id);
  }

  /**
   * Lists certificates in a given batch.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Get('batches/:id/certificates')
  async listBatchCertificates(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.issuanceService.listBatchCertificates(id, pageNum, limitNum);
  }

  /**
   * Retries failed certificates within a batch.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Post('batches/:id/retry')
  async retryBatch(
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parseResult = RetryBatchInputSchema.safeParse(body || {});
    const maxRetries = parseResult.success ? parseResult.data.maxRetries : 3;
    return this.batchProcessor.retryBatch(id, maxRetries);
  }

  /**
   * Queries generated certificates with pagination and search.
   */
  @RequirePermission(PermissionCode.CERT_GENERATE)
  @Get()
  async queryCertificates(@Query() rawQuery: Record<string, unknown>) {
    const parseResult = CertificateQuerySchema.safeParse(rawQuery);
    if (!parseResult.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid certificate query parameters',
        fields: parseResult.error.flatten().fieldErrors,
      });
    }

    return this.issuanceService.queryCertificates(parseResult.data);
  }

  /**
   * Downloads an issued certificate PDF with authorization check.
   */
  @Authenticated()
  @Get(':id/download')
  async downloadCertificate(
    @Param('id') id: string,
    @ReqUser() currentUser: CurrentUser,
    @Res() res: Response,
  ) {
    const { pdfBuffer, filename } = await this.issuanceService.getCertificateDownload(
      id,
      currentUser,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.status(HttpStatus.OK).send(pdfBuffer);
  }

  /**
   * Member self-service endpoint listing authenticated member's issued certificates.
   */
  @Authenticated()
  @Get('my')
  async getMyCertificates(@ReqUser() currentUser: CurrentUser) {
    return this.issuanceService.listUserCertificates(currentUser.id, currentUser.email);
  }
}
