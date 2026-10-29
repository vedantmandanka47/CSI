import { z } from 'zod';
import { PaginationMetaSchema } from './common.schema.js';

export const AuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().optional(),
  actor_id: z.string().uuid('Invalid actor UUID').optional(),
  target_type: z.string().trim().optional(),
  target_id: z.string().uuid('Invalid target UUID').optional(),
  from_date: z.string().datetime({ message: 'Invalid ISO start date' }).optional(),
  to_date: z.string().datetime({ message: 'Invalid ISO end date' }).optional(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string().uuid(),
  actor_id: z.string().uuid().nullable().optional(),
  action: z.string(),
  target_type: z.string().nullable().optional(),
  target_id: z.string().uuid().nullable().optional(),
  before_json: z.unknown().nullable().optional(),
  after_json: z.unknown().nullable().optional(),
  ip: z.string().nullable().optional(),
  created_at: z.union([z.string(), z.date()]),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogResponseSchema = z.object({
  data: z.array(AuditLogEntrySchema),
  meta: PaginationMetaSchema,
});

export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

