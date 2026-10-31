import { z } from 'zod';

export const PageOrientation = {
  LANDSCAPE: 'landscape',
  PORTRAIT: 'portrait',
} as const;

export type PageOrientation = (typeof PageOrientation)[keyof typeof PageOrientation];

export const TextAlignment = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
} as const;

export type TextAlignment = (typeof TextAlignment)[keyof typeof TextAlignment];

export const StandardFontFamily = {
  HELVETICA: 'Helvetica',
  HELVETICA_BOLD: 'Helvetica-Bold',
  HELVETICA_OBLIQUE: 'Helvetica-Oblique',
  HELVETICA_BOLD_OBLIQUE: 'Helvetica-BoldOblique',
  TIMES_ROMAN: 'Times-Roman',
  TIMES_BOLD: 'Times-Bold',
  TIMES_ITALIC: 'Times-Italic',
  TIMES_BOLD_ITALIC: 'Times-BoldItalic',
  COURIER: 'Courier',
  COURIER_BOLD: 'Courier-Bold',
  COURIER_OBLIQUE: 'Courier-Oblique',
  COURIER_BOLD_OBLIQUE: 'Courier-BoldOblique',
} as const;

export type StandardFontFamily = (typeof StandardFontFamily)[keyof typeof StandardFontFamily];

export const CertificateType = {
  PARTICIPATION: 'participation',
  MERIT: 'merit',
  APPRECIATION: 'appreciation',
  COMPLETION: 'completion',
  WINNER: 'winner',
  COORDINATOR: 'coordinator',
} as const;

export type CertificateType = (typeof CertificateType)[keyof typeof CertificateType];

const HexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const HexColorSchema = z
  .string()
  .regex(HexColorRegex, 'Invalid hex color format (e.g. #2B3A8C or #FFF)');

export const DimensionsSchema = z.object({
  width: z.number().positive().min(200, 'Page width must be at least 200 points').max(3000),
  height: z.number().positive().min(200, 'Page height must be at least 200 points').max(3000),
});

export const BorderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  primaryColor: HexColorSchema.default('#2B3A8C'),
  accentColor: HexColorSchema.default('#C8402F'),
  width: z.number().positive().min(0.5).max(30).default(3),
  inset: z.number().min(0).max(100).default(24),
  doubleBorder: z.boolean().default(true),
  secondaryWidth: z.number().positive().min(0.5).max(15).default(1),
  cornerOrnament: z.boolean().default(true),
});

export const TextElementConfigSchema = z.object({
  id: z.string().min(1).max(50),
  text: z.string().min(1).max(1000),
  x: z.number().finite(),
  y: z.number().finite(),
  fontFamily: z.string().min(1).max(100).default('Helvetica'),
  fontSize: z.number().positive().min(6).max(120).default(14),
  fontStyle: z.enum(['normal', 'bold', 'italic', 'bold-italic']).default('normal'),
  color: HexColorSchema.default('#111827'),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
  maxWidth: z.number().positive().max(3000).optional(),
  autoDownscale: z.boolean().default(false),
  minFontSize: z.number().positive().min(6).max(60).default(12),
  lineHeight: z.number().positive().min(0.8).max(3.0).default(1.2),
});

export const ImageElementConfigSchema = z.object({
  id: z.string().min(1).max(50),
  assetKey: z.string().min(1).max(100),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().min(5).max(1000),
  height: z.number().positive().min(5).max(1000),
  alignment: z.enum(['left', 'center', 'right']).default('center'),
  opacity: z.number().min(0).max(1).default(1),
});

export const SignatoryConfigSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  organization: z.string().max(100).optional(),
  signatureAssetKey: z.string().max(100).optional(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().min(50).max(400).default(160),
});

export const CertificateTemplateConfigSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional(),
  type: z.enum([
    CertificateType.PARTICIPATION,
    CertificateType.MERIT,
    CertificateType.APPRECIATION,
    CertificateType.COMPLETION,
    CertificateType.WINNER,
    CertificateType.COORDINATOR,
  ]).default(CertificateType.PARTICIPATION),
  dimensions: DimensionsSchema.default({ width: 841.89, height: 595.28 }), // Default A4 Landscape in points
  orientation: z.enum([PageOrientation.LANDSCAPE, PageOrientation.PORTRAIT]).default(PageOrientation.LANDSCAPE),
  backgroundColor: HexColorSchema.default('#FFFFFF'),
  border: BorderConfigSchema.optional(),
  textElements: z.array(TextElementConfigSchema).min(1, 'Template must contain at least one text element'),
  imageElements: z.array(ImageElementConfigSchema).default([]),
  signatories: z.array(SignatoryConfigSchema).default([]),
});

export const CertificateDataSchema = z.object({
  recipient_name: z
    .string({ required_error: 'Recipient name is required' })
    .min(1, 'Recipient name is required')
    .max(150),
  recipient_id: z.string().max(100).optional(),
  event_title: z
    .string({ required_error: 'Event title is required' })
    .min(1, 'Event title is required')
    .max(200),
  event_category: z.string().max(50).optional(),
  issue_date: z
    .string({ required_error: 'Issue date is required' })
    .min(1, 'Issue date is required')
    .max(50),
  achievement: z.string().max(200).optional(),
  certificate_number: z.string().max(100).optional(),
  college_name: z.string().max(150).optional(),
  custom_placeholders: z.record(z.string().min(1).max(50), z.string().max(500)).optional(),
});

export const RenderCertificateInputSchema = z.object({
  template: CertificateTemplateConfigSchema,
  data: CertificateDataSchema,
});

export const ValidateTemplateInputSchema = z.object({
  template: CertificateTemplateConfigSchema,
});

export const CertificateMetadataSchema = z.object({
  title: z.string(),
  author: z.string(),
  subject: z.string(),
  creator: z.string(),
  pageCount: z.number().int().positive(),
  fileSizeBytes: z.number().int().positive(),
  dimensions: DimensionsSchema,
});

export type BorderConfig = z.infer<typeof BorderConfigSchema>;
export type TextElementConfig = z.infer<typeof TextElementConfigSchema>;
export type ImageElementConfig = z.infer<typeof ImageElementConfigSchema>;
export type SignatoryConfig = z.infer<typeof SignatoryConfigSchema>;
export type CertificateTemplateConfig = z.infer<typeof CertificateTemplateConfigSchema>;
export type CertificateData = z.infer<typeof CertificateDataSchema>;
export type RenderCertificateInput = z.infer<typeof RenderCertificateInputSchema>;
export type ValidateTemplateInput = z.infer<typeof ValidateTemplateInputSchema>;
export type CertificateMetadata = z.infer<typeof CertificateMetadataSchema>;

/**
 * Standard PDF Page Sizes in Points (1 pt = 1/72 inch)
 */
export const STANDARD_PAGE_SIZES = {
  A4_LANDSCAPE: { width: 841.89, height: 595.28 },
  A4_PORTRAIT: { width: 595.28, height: 841.89 },
  LETTER_LANDSCAPE: { width: 792.0, height: 612.0 },
  LETTER_PORTRAIT: { width: 612.0, height: 792.0 },
} as const;
