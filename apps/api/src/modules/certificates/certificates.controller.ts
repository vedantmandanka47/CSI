import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PermissionCode,
  ValidateTemplateInputSchema,
  RenderCertificateInputSchema,
  CertificateTemplateConfigSchema,
  type CertificateData,
} from '@csi/shared';
import { RequirePermission } from '../../common/decorators/index.js';
import { CertificateTemplateEngineService } from './certificate-template-engine.service.js';

@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificateEngine: CertificateTemplateEngineService,
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

    const safeName = data.recipient_name.replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${safeName}.pdf"`);
    res.setHeader('Content-Length', rendered.pdfBuffer.length);
    return res.status(HttpStatus.OK).send(rendered.pdfBuffer);
  }
}
