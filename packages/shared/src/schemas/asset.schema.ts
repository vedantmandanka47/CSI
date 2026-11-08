import { z } from 'zod';
import { TaskUserSummarySchema } from './task.schema.js';

export const AssetCategory = {
  POSTER: 'poster',
  BANNER: 'banner',
  COPY: 'copy',
  VIDEO_CLIP: 'video_clip',
  DOCUMENT: 'document',
  OTHER: 'other',
} as const;

export type AssetCategory = (typeof AssetCategory)[keyof typeof AssetCategory];
export const ALL_ASSET_CATEGORIES = Object.values(AssetCategory) as [string, ...string[]];

export const AssetStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];
export const ALL_ASSET_STATUSES = Object.values(AssetStatus) as [string, ...string[]];

/** Maximum binary size for uploaded workspace media assets (10 MB) */
export const MAX_ASSET_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes (RR:SEC-09)

/**
 * Maximum encoded base64 character length (~14 MB).
 * 10 MB binary expands to 13,981,016 base64 characters (+ optional data-uri prefix).
 */
export const MAX_ASSET_BASE64_LENGTH = 14 * 1024 * 1024; // 14,680,064 characters

/**
 * Fast, allocation-free estimation of decoded binary byte size from a base64 string or data URI.
 */
export function estimateBase64DecodedBytes(base64Str: string): number {
  const commaIdx = base64Str.indexOf(',');
  const raw = commaIdx !== -1 ? base64Str.slice(commaIdx + 1) : base64Str;
  const clean = raw.trim();
  if (clean.length === 0) return 0;
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export const UploadAssetSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, 'Asset title must be at least 3 characters')
      .max(255, 'Asset title cannot exceed 255 characters'),
    category: z.enum(ALL_ASSET_CATEGORIES).default(AssetCategory.OTHER),
    fileName: z
      .string()
      .trim()
      .min(1, 'File name is required')
      .max(255, 'File name cannot exceed 255 characters'),
    fileBase64: z
      .string()
      .min(1, 'File content (base64) is required')
      .max(
        MAX_ASSET_BASE64_LENGTH,
        `Asset base64 content cannot exceed ${MAX_ASSET_BASE64_LENGTH} characters (~10 MB binary)`,
      ),
    eventId: z.string().uuid('Invalid event ID').optional().nullable(),
    taskId: z.string().uuid('Invalid task ID').optional().nullable(),
  })
  .refine(
    (data) => estimateBase64DecodedBytes(data.fileBase64) <= MAX_ASSET_FILE_SIZE_BYTES,
    {
      message: `Decoded file size exceeds maximum allowed size of 10 MB (${MAX_ASSET_FILE_SIZE_BYTES} bytes)`,
      path: ['fileBase64'],
    },
  );

export type UploadAssetInput = z.infer<typeof UploadAssetSchema>;

export const ReviewAssetSchema = z.object({
  status: z.enum([AssetStatus.APPROVED, AssetStatus.REJECTED] as const),
  reviewNotes: z.string().trim().max(2000).optional().nullable(),
});

export type ReviewAssetInput = z.infer<typeof ReviewAssetSchema>;

export const AssetResponseSchema = z.object({
  id: z.string().uuid(),
  committeeId: z.string().uuid(),
  committeeCode: z.string().optional(),
  eventId: z.string().uuid().nullable().optional(),
  eventTitle: z.string().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  title: z.string(),
  category: z.enum(ALL_ASSET_CATEGORIES),
  fileName: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  mimeType: z.string(),
  fileHash: z.string(),
  status: z.enum(ALL_ASSET_STATUSES),
  reviewNotes: z.string().nullable(),
  reviewedById: z.string().uuid().nullable(),
  reviewedBy: TaskUserSummarySchema.nullable().optional(),
  reviewedAt: z.string().nullable(),
  uploadedById: z.string().uuid(),
  uploadedBy: TaskUserSummarySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AssetResponse = z.infer<typeof AssetResponseSchema>;

export const AssetListResponseSchema = z.object({
  assets: z.array(AssetResponseSchema),
  total: z.number().int().nonnegative(),
});

export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;
