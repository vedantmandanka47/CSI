import { z } from 'zod';
import { CertificateType, CertificateTemplateConfigSchema } from './certificate-template.schema.js';

export const BatchStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  PARTIALLY_COMPLETED: 'partially_completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const CertificateStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  GENERATED: 'generated',
  FAILED: 'failed',
  REVOKED: 'revoked',
} as const;

export type CertificateStatus = (typeof CertificateStatus)[keyof typeof CertificateStatus];

export const RecipientEligibilityMode = {
  VERIFIED_ATTENDANCE: 'verified_attendance',
  ALL_REGISTERED: 'all_registered',
  EXPLICIT_SELECTION: 'explicit_selection',
} as const;

export type RecipientEligibilityMode =
  (typeof RecipientEligibilityMode)[keyof typeof RecipientEligibilityMode];

export const BatchRecipientInputSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email(),
  name: z.string().min(1).max(150).optional(),
  achievement: z.string().max(200).optional(),
  customPlaceholders: z.record(z.string().min(1).max(50), z.string().max(500)).optional(),
});

export type BatchRecipientInput = z.infer<typeof BatchRecipientInputSchema>;

export const CreateCertificateBatchInputSchema = z.object({
  eventId: z.string().uuid('Event ID must be a valid UUID'),
  templateId: z.string().min(1).max(100).default('csi-default-participation'),
  templateConfig: CertificateTemplateConfigSchema.optional(),
  certificateType: z
    .enum([
      CertificateType.PARTICIPATION,
      CertificateType.MERIT,
      CertificateType.APPRECIATION,
      CertificateType.COMPLETION,
      CertificateType.WINNER,
      CertificateType.COORDINATOR,
    ])
    .default(CertificateType.PARTICIPATION),
  eligibilityMode: z
    .enum([
      RecipientEligibilityMode.VERIFIED_ATTENDANCE,
      RecipientEligibilityMode.ALL_REGISTERED,
      RecipientEligibilityMode.EXPLICIT_SELECTION,
    ])
    .default(RecipientEligibilityMode.VERIFIED_ATTENDANCE),
  issueDate: z.string().min(1).max(50).optional(),
  recipients: z.array(BatchRecipientInputSchema).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export type CreateCertificateBatchInput = z.infer<typeof CreateCertificateBatchInputSchema>;

export const CertificateBatchResponseSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  templateId: z.string(),
  certificateType: z.string(),
  status: z.enum([
    BatchStatus.PENDING,
    BatchStatus.PROCESSING,
    BatchStatus.COMPLETED,
    BatchStatus.PARTIALLY_COMPLETED,
    BatchStatus.FAILED,
    BatchStatus.CANCELLED,
  ]),
  totalCount: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  progressPercent: z.number().min(0).max(100),
  createdById: z.string().uuid(),
  failureReason: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).nullable().optional(),
});

export type CertificateBatchResponse = z.infer<typeof CertificateBatchResponseSchema>;

export const CertificateDetailSchema = z.object({
  id: z.string().uuid(),
  batchId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid(),
  recipientType: z.string(),
  recipientId: z.string().uuid().nullable().optional(),
  recipientEmail: z.string().email(),
  recipientName: z.string(),
  certificateType: z.string(),
  certificateNumber: z.string(),
  issueDate: z.string(),
  achievement: z.string().nullable().optional(),
  status: z.enum([
    CertificateStatus.PENDING,
    CertificateStatus.PROCESSING,
    CertificateStatus.GENERATED,
    CertificateStatus.FAILED,
    CertificateStatus.REVOKED,
  ]),
  fileSizeBytes: z.number().int().positive().nullable().optional(),
  errorReason: z.string().nullable().optional(),
  retryCount: z.number().int().nonnegative(),
  issuedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
});

export type CertificateDetail = z.infer<typeof CertificateDetailSchema>;

export const CertificateQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  eventId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  status: z.enum([
    CertificateStatus.PENDING,
    CertificateStatus.PROCESSING,
    CertificateStatus.GENERATED,
    CertificateStatus.FAILED,
    CertificateStatus.REVOKED,
  ]).optional(),
  recipientEmail: z.string().optional(),
  search: z.string().max(100).optional(),
});

export type CertificateQuery = z.infer<typeof CertificateQuerySchema>;

export const RetryBatchInputSchema = z.object({
  maxRetries: z.coerce.number().int().positive().max(5).default(3),
});

export type RetryBatchInput = z.infer<typeof RetryBatchInputSchema>;
