import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import {
  FontManagerService,
  AssetManagerService,
  LayoutEngineService,
  CertificateTemplateEngineService,
} from '../../../../../apps/api/src/modules/certificates/index.js';
import {
  CertificateData,
  STANDARD_PAGE_SIZES,
} from '@csi/shared';

describe('Certificate Template Engine (M11)', () => {
  let templateEngine: CertificateTemplateEngineService;
  let layoutEngine: LayoutEngineService;
  let assetManager: AssetManagerService;
  let fontManager: FontManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FontManagerService,
        AssetManagerService,
        LayoutEngineService,
        CertificateTemplateEngineService,
      ],
    }).compile();

    templateEngine = module.get<CertificateTemplateEngineService>(CertificateTemplateEngineService);
    layoutEngine = module.get<LayoutEngineService>(LayoutEngineService);
    assetManager = module.get<AssetManagerService>(AssetManagerService);
    fontManager = module.get<FontManagerService>(FontManagerService);
  });

  describe('LayoutEngineService', () => {
    it('should correctly convert 6-character hex color to pdf-lib RGB', () => {
      const rgb = layoutEngine.hexToPdfRgb('#1E3A8A');
      expect(rgb.red).toBeCloseTo(30 / 255, 3);
      expect(rgb.green).toBeCloseTo(58 / 255, 3);
      expect(rgb.blue).toBeCloseTo(138 / 255, 3);
    });

    it('should correctly convert 3-character hex color to pdf-lib RGB', () => {
      const rgb = layoutEngine.hexToPdfRgb('#FFF');
      expect(rgb.red).toBeCloseTo(1, 4);
      expect(rgb.green).toBeCloseTo(1, 4);
      expect(rgb.blue).toBeCloseTo(1, 4);
    });

    it('should calculate text position for left, center, and right alignments', async () => {
      const doc = await PDFDocument.create();
      const font = await fontManager.resolveFont(doc, 'Helvetica', 'normal');
      const text = 'Test Header';
      const fontSize = 16;
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      const leftPos = layoutEngine.calculateTextPosition(text, font, fontSize, 100, 200, 'left');
      expect(leftPos.x).toBe(100);
      expect(leftPos.y).toBe(200);

      const centerPos = layoutEngine.calculateTextPosition(text, font, fontSize, 100, 200, 'center');
      expect(centerPos.x).toBeCloseTo(100 - textWidth / 2, 2);

      const rightPos = layoutEngine.calculateTextPosition(text, font, fontSize, 100, 200, 'right');
      expect(rightPos.x).toBeCloseTo(100 - textWidth, 2);
    });

    it('should auto-downscale font size when text width exceeds maxWidth', async () => {
      const doc = await PDFDocument.create();
      const font = await fontManager.resolveFont(doc, 'Helvetica', 'bold');
      const veryLongText = 'Professor Dr. Bartholomew Archibald Montgomery Montgomery-Smith III';
      const initialSize = 28;
      const maxWidth = 500;
      const minFontSize = 12;

      const fittedSize = layoutEngine.calculateFittedFontSize(
        veryLongText,
        font,
        initialSize,
        maxWidth,
        minFontSize,
      );

      expect(fittedSize).toBeLessThan(initialSize);
      expect(fittedSize).toBeGreaterThanOrEqual(minFontSize);

      // Verify downscaled text fits inside maxWidth
      const fittedWidth = font.widthOfTextAtSize(veryLongText, fittedSize);
      expect(fittedWidth).toBeLessThanOrEqual(maxWidth);
    });

    it('should wrap text across multiple lines when text exceeds maxWidth', async () => {
      const doc = await PDFDocument.create();
      const font = await fontManager.resolveFont(doc, 'Helvetica', 'normal');
      const paragraph =
        'This is a comprehensive description of an event that spans across multiple sentences and should wrap into separate lines.';
      const lines = layoutEngine.wrapText(paragraph, font, 12, 180);

      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(font.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(180 + 10);
      }
    });

    it('should calculate image position for left, center, and right alignments', () => {
      const width = 100;
      const height = 50;

      const center = layoutEngine.calculateImagePosition(width, height, 400, 300, 'center');
      expect(center.x).toBe(350);
      expect(center.y).toBe(300);

      const left = layoutEngine.calculateImagePosition(width, height, 400, 300, 'left');
      expect(left.x).toBe(400);

      const right = layoutEngine.calculateImagePosition(width, height, 400, 300, 'right');
      expect(right.x).toBe(300);
    });
  });

  describe('AssetManagerService', () => {
    it('should reject empty or missing asset keys', async () => {
      const doc = await PDFDocument.create();
      await expect(assetManager.embedAsset(doc, '')).rejects.toThrow(BadRequestException);
      await expect(assetManager.embedAsset(doc, '   ')).rejects.toThrow(BadRequestException);
    });

    it('should reject path traversal in named asset keys', async () => {
      const doc = await PDFDocument.create();
      await expect(assetManager.embedAsset(doc, '../../etc/passwd')).rejects.toThrow(
        BadRequestException,
      );
      await expect(assetManager.embedAsset(doc, 'assets/logo')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent asset keys', async () => {
      const doc = await PDFDocument.create();
      await expect(assetManager.embedAsset(doc, 'non_existent_asset_xyz')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should embed valid institutional named asset (csi_logo)', async () => {
      const doc = await PDFDocument.create();
      const img = await assetManager.embedAsset(doc, 'csi_logo');
      expect(img).toBeDefined();
      expect(img.width).toBeGreaterThan(0);
      expect(img.height).toBeGreaterThan(0);
    });

    it('should embed valid base64 PNG data URI', async () => {
      const doc = await PDFDocument.create();
      // Valid 1x1 transparent PNG
      const validPngUri =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=';
      const img = await assetManager.embedAsset(doc, validPngUri);
      expect(img).toBeDefined();
      expect(img.width).toBe(1);
      expect(img.height).toBe(1);
    });

    it('should reject corrupt base64 image data URI with invalid magic bytes', async () => {
      const doc = await PDFDocument.create();
      const invalidDataUri = 'data:image/png;base64,bm90LWEtcmVhbC1pbWFnZS1maWxl';
      await expect(assetManager.embedAsset(doc, invalidDataUri)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('FontManagerService', () => {
    it('should resolve standard Helvetica, Times, and Courier fonts with styles', async () => {
      const doc = await PDFDocument.create();

      const helveticaNormal = await fontManager.resolveFont(doc, 'Helvetica', 'normal');
      const helveticaBold = await fontManager.resolveFont(doc, 'Helvetica', 'bold');
      const timesItalic = await fontManager.resolveFont(doc, 'Times-Roman', 'italic');
      const courierBold = await fontManager.resolveFont(doc, 'Courier', 'bold');

      expect(helveticaNormal).toBeDefined();
      expect(helveticaBold).toBeDefined();
      expect(timesItalic).toBeDefined();
      expect(courierBold).toBeDefined();
    });

    it('should reject registering custom font with corrupt magic bytes', () => {
      const corruptBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(() => fontManager.registerCustomFont('InvalidFont', corruptBuffer)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('CertificateTemplateEngineService', () => {
    const validData: CertificateData = {
      recipient_name: 'Ananya Sharma',
      recipient_id: 'CSI-2026-M-042',
      event_title: 'Full Stack Web Architecture Bootcamp',
      event_category: 'WORKSHOP',
      issue_date: 'October 31, 2026',
      achievement: 'Winner',
      certificate_number: 'CSI-GCET-2026-0042',
      college_name: 'GCET Engineering College',
      custom_placeholders: {
        rank: '1st Position',
        mentor: 'Dr. Jane Smith',
      },
    };

    it('should interpolate standard and custom placeholders correctly', () => {
      const raw =
        'Congratulations {{recipient_name}} for securing {{rank}} in {{event_title}} on {{issue_date}}! ID: {{certificate_number}}';
      const interpolated = templateEngine.interpolatePlaceholders(raw, validData);

      expect(interpolated).toBe(
        'Congratulations Ananya Sharma for securing 1st Position in Full Stack Web Architecture Bootcamp on October 31, 2026! ID: CSI-GCET-2026-0042',
      );
    });

    it('should safely replace unknown or missing placeholders with empty string without error', () => {
      const raw = 'Hello {{unknown_token}} and {{custom_placeholders.not_found}}';
      const interpolated = templateEngine.interpolatePlaceholders(raw, validData);
      expect(interpolated).toBe('Hello  and ');
    });

    it('should validate official default CSI templates without error', () => {
      const validatedPart = templateEngine.validateTemplate(
        CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
      );
      expect(validatedPart.id).toBe('csi-default-participation');

      const validatedMerit = templateEngine.validateTemplate(
        CertificateTemplateEngineService.DEFAULT_CSI_MERIT_TEMPLATE,
      );
      expect(validatedMerit.id).toBe('csi-default-merit');
    });

    it('should reject malformed template configurations with BadRequestException', () => {
      const invalidTemplate = {
        id: '',
        textElements: [],
      };
      expect(() => templateEngine.validateTemplate(invalidTemplate)).toThrow(BadRequestException);
    });

    it('should render a valid deterministic PDF certificate for participation', async () => {
      const result = await templateEngine.renderCertificate(
        CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
        validData,
      );

      expect(result.pdfBuffer).toBeInstanceOf(Buffer);
      expect(result.pdfBuffer.length).toBeGreaterThan(1000);

      // Verify PDF magic header
      const header = result.pdfBuffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');

      // Verify metadata
      expect(result.metadata.pageCount).toBe(1);
      expect(result.metadata.author).toBe('CSI GCET Student Branch');
      expect(result.metadata.dimensions).toEqual(STANDARD_PAGE_SIZES.A4_LANDSCAPE);

      // Parse with PDFDocument to verify internal structure
      const parsedDoc = await PDFDocument.load(result.pdfBuffer);
      expect(parsedDoc.getPageCount()).toBe(1);
      const page = parsedDoc.getPage(0);
      expect(page.getWidth()).toBeCloseTo(STANDARD_PAGE_SIZES.A4_LANDSCAPE.width, 1);
      expect(page.getHeight()).toBeCloseTo(STANDARD_PAGE_SIZES.A4_LANDSCAPE.height, 1);
      expect(parsedDoc.getTitle()).toContain('Ananya Sharma');
    });

    it('should render a valid PDF certificate for merit template', async () => {
      const result = await templateEngine.renderCertificate(
        CertificateTemplateEngineService.DEFAULT_CSI_MERIT_TEMPLATE,
        validData,
      );

      expect(result.pdfBuffer.length).toBeGreaterThan(1000);
      const parsedDoc = await PDFDocument.load(result.pdfBuffer);
      expect(parsedDoc.getPageCount()).toBe(1);
      expect(parsedDoc.getSubject()).toBe('MERIT Certificate');
    });

    it('should handle very long recipient name with auto-downscaling seamlessly', async () => {
      const longNameData: CertificateData = {
        ...validData,
        recipient_name: 'Alexandrina Stephanie Katherine Montgomery-Cunningham-Hetherington III',
      };

      const result = await templateEngine.renderCertificate(
        CertificateTemplateEngineService.DEFAULT_CSI_PARTICIPATION_TEMPLATE,
        longNameData,
      );

      expect(result.pdfBuffer).toBeDefined();
      const parsedDoc = await PDFDocument.load(result.pdfBuffer);
      expect(parsedDoc.getPageCount()).toBe(1);
      expect(parsedDoc.getTitle()).toContain('Alexandrina Stephanie');
    });
  });
});
