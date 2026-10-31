import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import {
  CertificateTemplateConfig,
  CertificateTemplateConfigSchema,
  CertificateData,
  CertificateDataSchema,
  CertificateMetadata,
  CertificateType,
  PageOrientation,
  STANDARD_PAGE_SIZES,
} from '@csi/shared';
import { FontManagerService } from './font-manager.service.js';
import { AssetManagerService } from './asset-manager.service.js';
import { LayoutEngineService } from './layout-engine.service.js';
import QRCode from 'qrcode';

export interface RenderCertificateResult {
  pdfBuffer: Buffer;
  metadata: CertificateMetadata;
}

@Injectable()
export class CertificateTemplateEngineService {
  private readonly logger = new Logger(CertificateTemplateEngineService.name);

  constructor(
    private readonly fontManager: FontManagerService,
    private readonly assetManager: AssetManagerService,
    private readonly layoutEngine: LayoutEngineService,
  ) {}

  /**
   * Built-in standard CSI GCET Participation Certificate Template.
   */
  public static readonly DEFAULT_CSI_PARTICIPATION_TEMPLATE: CertificateTemplateConfig = {
    id: 'csi-default-participation',
    name: 'CSI Standard Certificate of Participation',
    description: 'Official CSI GCET Student Branch Participation Certificate Template',
    type: CertificateType.PARTICIPATION,
    dimensions: STANDARD_PAGE_SIZES.A4_LANDSCAPE,
    orientation: PageOrientation.LANDSCAPE,
    backgroundColor: '#FFFFFF',
    border: {
      enabled: true,
      primaryColor: '#1E3A8A', // CSI Blue
      accentColor: '#C8402F', // CSI Red
      width: 3.5,
      inset: 24,
      doubleBorder: true,
      secondaryWidth: 1.2,
      cornerOrnament: true,
    },
    imageElements: [
      {
        id: 'csi-logo',
        assetKey: 'csi_logo',
        x: 420.94, // Centered horizontally on A4 Landscape (841.89 / 2)
        y: 495,
        width: 80,
        height: 80,
        alignment: 'center',
        opacity: 1,
      },
    ],
    textElements: [
      {
        id: 'org-heading',
        text: 'COMPUTER SOCIETY OF INDIA',
        x: 420.94,
        y: 450,
        fontFamily: 'Helvetica',
        fontStyle: 'bold',
        fontSize: 16,
        color: '#1E3A8A',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 12,
        lineHeight: 1.2,
      },
      {
        id: 'branch-heading',
        text: 'GCET STUDENT BRANCH (REGION III)',
        x: 420.94,
        y: 432,
        fontFamily: 'Helvetica',
        fontStyle: 'normal',
        fontSize: 11,
        color: '#4B5563',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 10,
        lineHeight: 1.2,
      },
      {
        id: 'cert-title',
        text: 'CERTIFICATE OF PARTICIPATION',
        x: 420.94,
        y: 385,
        fontFamily: 'Helvetica',
        fontStyle: 'bold',
        fontSize: 24,
        color: '#C8402F',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 16,
        lineHeight: 1.2,
      },
      {
        id: 'certify-body',
        text: 'This is proudly presented to',
        x: 420.94,
        y: 345,
        fontFamily: 'Times-Roman',
        fontStyle: 'italic',
        fontSize: 14,
        color: '#374151',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 12,
        lineHeight: 1.2,
      },
      {
        id: 'recipient-name',
        text: '{{recipient_name}}',
        x: 420.94,
        y: 300,
        fontFamily: 'Helvetica',
        fontStyle: 'bold',
        fontSize: 28,
        color: '#111827',
        alignment: 'center',
        maxWidth: 680,
        autoDownscale: true,
        minFontSize: 16,
        lineHeight: 1.2,
      },
      {
        id: 'participation-desc',
        text: 'for active participation in "{{event_title}}" conducted by CSI GCET Student Branch on {{issue_date}}.',
        x: 420.94,
        y: 250,
        fontFamily: 'Helvetica',
        fontStyle: 'normal',
        fontSize: 13,
        color: '#4B5563',
        alignment: 'center',
        maxWidth: 650,
        autoDownscale: false,
        minFontSize: 11,
        lineHeight: 1.4,
      },
      {
        id: 'cert-number',
        text: 'Certificate ID: {{certificate_number}}',
        x: 420.94,
        y: 50,
        fontFamily: 'Courier',
        fontStyle: 'normal',
        fontSize: 9,
        color: '#9CA3AF',
        alignment: 'center',
        maxWidth: 500,
        autoDownscale: false,
        minFontSize: 8,
        lineHeight: 1.0,
      },
    ],
    signatories: [
      {
        id: 'sig-chair',
        name: 'Student Branch Chairperson',
        title: 'Chairperson',
        organization: 'CSI GCET Student Branch',
        x: 230,
        y: 120,
        width: 180,
      },
      {
        id: 'sig-counselor',
        name: 'Student Branch Counselor',
        title: 'Faculty Counselor',
        organization: 'GCET Engineering College',
        x: 610,
        y: 120,
        width: 180,
      },
    ],
    qrCode: {
      enabled: true,
      x: 720,
      y: 45,
      size: 60,
    },
  };

  /**
   * Built-in standard CSI GCET Merit Certificate Template.
   */
  public static readonly DEFAULT_CSI_MERIT_TEMPLATE: CertificateTemplateConfig = {
    ...CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
    id: 'csi-default-merit',
    name: 'CSI Standard Certificate of Merit',
    description: 'Official CSI GCET Student Branch Merit/Award Certificate Template',
    type: CertificateType.MERIT,
    textElements: [
      {
        id: 'org-heading',
        text: 'COMPUTER SOCIETY OF INDIA',
        x: 420.94,
        y: 450,
        fontFamily: 'Helvetica',
        fontStyle: 'bold',
        fontSize: 16,
        color: '#1E3A8A',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 12,
        lineHeight: 1.2,
      },
      {
        id: 'branch-heading',
        text: 'GCET STUDENT BRANCH (REGION III)',
        x: 420.94,
        y: 432,
        fontFamily: 'Helvetica',
        fontStyle: 'normal',
        fontSize: 11,
        color: '#4B5563',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 10,
        lineHeight: 1.2,
      },
      {
        id: 'cert-title',
        text: 'CERTIFICATE OF MERIT',
        x: 420.94,
        y: 385,
        fontFamily: 'Helvetica',
        fontStyle: 'bold',
        fontSize: 24,
        color: '#D97706', // Gold / Amber
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 16,
        lineHeight: 1.2,
      },
      {
        id: 'certify-body',
        text: 'This certificate of excellence is awarded to',
        x: 420.94,
        y: 345,
        fontFamily: 'Times-Roman',
        fontStyle: 'italic',
        fontSize: 14,
        color: '#374151',
        alignment: 'center',
        maxWidth: 700,
        autoDownscale: false,
        minFontSize: 12,
        lineHeight: 1.2,
      },
      {
        id: 'recipient-name',
        text: '{{recipient_name}}',
        x: 420.94,
        y: 300,
        fontFamily: 'Helvetica',
        fontStyle: 'bold',
        fontSize: 28,
        color: '#111827',
        alignment: 'center',
        maxWidth: 680,
        autoDownscale: true,
        minFontSize: 16,
        lineHeight: 1.2,
      },
      {
        id: 'achievement-desc',
        text: 'for securing {{achievement}} in "{{event_title}}" organized by CSI GCET Student Branch on {{issue_date}}.',
        x: 420.94,
        y: 250,
        fontFamily: 'Helvetica',
        fontStyle: 'normal',
        fontSize: 13,
        color: '#4B5563',
        alignment: 'center',
        maxWidth: 650,
        autoDownscale: false,
        minFontSize: 11,
        lineHeight: 1.4,
      },
      {
        id: 'cert-number',
        text: 'Certificate ID: {{certificate_number}}',
        x: 420.94,
        y: 50,
        fontFamily: 'Courier',
        fontStyle: 'normal',
        fontSize: 9,
        color: '#9CA3AF',
        alignment: 'center',
        maxWidth: 500,
        autoDownscale: false,
        minFontSize: 8,
        lineHeight: 1.0,
      },
    ],
  };

  /**
   * Validates a certificate template configuration.
   */
  validateTemplate(template: unknown): CertificateTemplateConfig {
    const parseResult = CertificateTemplateConfigSchema.safeParse(template);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Invalid certificate template configuration',
        errors: parseResult.error.format(),
      });
    }
    return parseResult.data;
  }

  /**
   * Validates participant certificate data.
   */
  validateData(data: unknown): CertificateData {
    const parseResult = CertificateDataSchema.safeParse(data);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Invalid certificate participant data',
        errors: parseResult.error.format(),
      });
    }
    return parseResult.data;
  }

  /**
   * Pure deterministic PDF rendering engine using pdf-lib and vector primitives.
   */
  async renderCertificate(
    templateInput: CertificateTemplateConfig,
    dataInput: CertificateData,
  ): Promise<RenderCertificateResult> {
    const template = this.validateTemplate(templateInput);
    const data = this.validateData(dataInput);

    const doc = await PDFDocument.create();
    const { width, height } = template.dimensions;
    const page = doc.addPage([width, height]);

    // 1. Draw Background
    if (template.backgroundColor && template.backgroundColor.toUpperCase() !== '#FFFFFF') {
      const bgRgb = this.layoutEngine.hexToPdfRgb(template.backgroundColor);
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: bgRgb,
      });
    }

    // 2. Draw Decorative Borders and Ornaments
    if (template.border?.enabled) {
      this.drawBorders(page, template.border, width, height);
    }

    // 3. Render Image Elements
    if (template.imageElements && template.imageElements.length > 0) {
      for (const imgConfig of template.imageElements) {
        try {
          const embeddedImage = await this.assetManager.embedAsset(doc, imgConfig.assetKey);
          const bounds = this.layoutEngine.calculateImagePosition(
            imgConfig.width,
            imgConfig.height,
            imgConfig.x,
            imgConfig.y,
            imgConfig.alignment,
          );

          page.drawImage(embeddedImage, {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            opacity: imgConfig.opacity ?? 1,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Failed to embed image asset '${imgConfig.assetKey}': ${message}`);
        }
      }
    }

    // 4. Render Text Elements
    for (const textConfig of template.textElements) {
      const interpolatedText = this.interpolatePlaceholders(textConfig.text, data);
      const font = await this.fontManager.resolveFont(
        doc,
        textConfig.fontFamily,
        textConfig.fontStyle,
      );

      const textColor = this.layoutEngine.hexToPdfRgb(textConfig.color);

      // Determine font size with auto-downscaling if enabled
      let activeFontSize = textConfig.fontSize;
      if (textConfig.autoDownscale && textConfig.maxWidth) {
        activeFontSize = this.layoutEngine.calculateFittedFontSize(
          interpolatedText,
          font,
          textConfig.fontSize,
          textConfig.maxWidth,
          textConfig.minFontSize ?? 10,
        );
      }

      // Handle multiline wrapping or single-line drawing
      const lines = textConfig.maxWidth && !textConfig.autoDownscale
        ? this.layoutEngine.wrapText(interpolatedText, font, activeFontSize, textConfig.maxWidth)
        : interpolatedText.split('\n');

      const lineHeightMultiplier = textConfig.lineHeight ?? 1.2;
      const lineStep = activeFontSize * lineHeightMultiplier;

      lines.forEach((line, index) => {
        if (line.trim().length === 0) return;

        const currentLineY = textConfig.y - index * lineStep;
        const bounds = this.layoutEngine.calculateTextPosition(
          line,
          font,
          activeFontSize,
          textConfig.x,
          currentLineY,
          textConfig.alignment,
        );

        page.drawText(line, {
          x: bounds.x,
          y: bounds.y,
          size: activeFontSize,
          font,
          color: textColor,
        });
      });
    }

    // 5. Render Signatories
    if (template.signatories && template.signatories.length > 0) {
      for (const sig of template.signatories) {
        await this.renderSignatory(doc, page, sig);
      }
    }

    // 6. Render Anti-Forgery QR Code (M13)
    const qrEnabled = template.qrCode ? template.qrCode.enabled !== false : true;
    if (qrEnabled && data.verification_url) {
      try {
        const qrSize = template.qrCode?.size ?? 60;
        const qrX = template.qrCode?.x ?? (width - qrSize - 40);
        const qrY = template.qrCode?.y ?? 45;

        const qrPngBuffer = await QRCode.toBuffer(data.verification_url, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: Math.round(qrSize * 3),
          color: {
            dark: '#1E3A8A',
            light: '#FFFFFF',
          },
        });

        const qrImage = await doc.embedPng(qrPngBuffer);
        page.drawImage(qrImage, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to render verification QR code: ${message}`);
      }
    }

    // 7. Set PDF Document Metadata
    const docTitle = `${template.name} - ${data.recipient_name}`;
    doc.setTitle(docTitle);
    doc.setAuthor('CSI GCET Student Branch');
    doc.setSubject(`${template.type.toUpperCase()} Certificate`);
    doc.setCreator('CSI GCET Certificate Engine v1.0');
    doc.setCreationDate(new Date());

    const pdfBytes = await doc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    const metadata: CertificateMetadata = {
      title: docTitle,
      author: 'CSI GCET Student Branch',
      subject: `${template.type.toUpperCase()} Certificate`,
      creator: 'CSI GCET Certificate Engine v1.0',
      pageCount: 1,
      fileSizeBytes: pdfBuffer.length,
      dimensions: template.dimensions,
    };

    return {
      pdfBuffer,
      metadata,
    };
  }

  /**
   * Safely interpolates placeholders with validated participant data without eval.
   */
  public interpolatePlaceholders(rawText: string, data: CertificateData): string {
    return rawText.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
      // Check top-level properties
      if (key in data) {
        const val = (data as Record<string, unknown>)[key];
        return val !== undefined && val !== null ? String(val) : '';
      }

      // Check custom_placeholders map
      if (data.custom_placeholders) {
        if (key.startsWith('custom_placeholders.')) {
          const subKey = key.replace('custom_placeholders.', '');
          return data.custom_placeholders[subKey] ?? '';
        }
        if (key in data.custom_placeholders) {
          return data.custom_placeholders[key] ?? '';
        }
      }

      return '';
    });
  }

  /**
   * Draws decorative border frames and corner ornaments.
   */
  private drawBorders(
    page: PDFPage,
    border: NonNullable<CertificateTemplateConfig['border']>,
    pageWidth: number,
    pageHeight: number,
  ): void {
    const primaryRgb = this.layoutEngine.hexToPdfRgb(border.primaryColor);
    const accentRgb = this.layoutEngine.hexToPdfRgb(border.accentColor);
    const inset = border.inset;

    // Outer Border
    page.drawRectangle({
      x: inset,
      y: inset,
      width: pageWidth - 2 * inset,
      height: pageHeight - 2 * inset,
      borderColor: primaryRgb,
      borderWidth: border.width,
    });

    // Inner Secondary Border
    if (border.doubleBorder) {
      const innerInset = inset + 6;
      page.drawRectangle({
        x: innerInset,
        y: innerInset,
        width: pageWidth - 2 * innerInset,
        height: pageHeight - 2 * innerInset,
        borderColor: accentRgb,
        borderWidth: border.secondaryWidth,
      });

      // Corner Ornaments
      if (border.cornerOrnament) {
        const ornamentSize = 8;
        const cornerOffsets = [
          { x: innerInset + 3, y: innerInset + 3 },
          { x: pageWidth - innerInset - 3 - ornamentSize, y: innerInset + 3 },
          { x: innerInset + 3, y: pageHeight - innerInset - 3 - ornamentSize },
          { x: pageWidth - innerInset - 3 - ornamentSize, y: pageHeight - innerInset - 3 - ornamentSize },
        ];

        for (const pos of cornerOffsets) {
          page.drawRectangle({
            x: pos.x,
            y: pos.y,
            width: ornamentSize,
            height: ornamentSize,
            color: accentRgb,
          });
        }
      }
    }
  }

  /**
   * Renders a signatory block with optional signature image, line, name, and title.
   */
  private async renderSignatory(
    doc: PDFDocument,
    page: PDFPage,
    sig: NonNullable<CertificateTemplateConfig['signatories']>[number],
  ): Promise<void> {
    const sigFont = await this.fontManager.resolveFont(doc, 'Helvetica', 'bold');
    const titleFont = await this.fontManager.resolveFont(doc, 'Helvetica', 'normal');
    const halfWidth = sig.width / 2;

    // 1. Signature image if present
    if (sig.signatureAssetKey) {
      try {
        const sigImage = await this.assetManager.embedAsset(doc, sig.signatureAssetKey);
        const imgWidth = Math.min(sig.width * 0.8, 120);
        const imgHeight = 40;
        page.drawImage(sigImage, {
          x: sig.x - imgWidth / 2,
          y: sig.y + 6,
          width: imgWidth,
          height: imgHeight,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to embed signatory asset '${sig.signatureAssetKey}': ${msg}`);
      }
    }

    // 2. Signature line
    page.drawLine({
      start: { x: sig.x - halfWidth, y: sig.y },
      end: { x: sig.x + halfWidth, y: sig.y },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
    });

    // 3. Signatory name
    const nameWidth = sigFont.widthOfTextAtSize(sig.name, 11);
    page.drawText(sig.name, {
      x: sig.x - nameWidth / 2,
      y: sig.y - 14,
      size: 11,
      font: sigFont,
      color: rgb(0.1, 0.1, 0.1),
    });

    // 4. Signatory title
    const titleWidth = titleFont.widthOfTextAtSize(sig.title, 9.5);
    page.drawText(sig.title, {
      x: sig.x - titleWidth / 2,
      y: sig.y - 26,
      size: 9.5,
      font: titleFont,
      color: rgb(0.35, 0.35, 0.35),
    });

    // 5. Signatory organization if present
    if (sig.organization) {
      const orgWidth = titleFont.widthOfTextAtSize(sig.organization, 8.5);
      page.drawText(sig.organization, {
        x: sig.x - orgWidth / 2,
        y: sig.y - 37,
        size: 8.5,
        font: titleFont,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  }
}
