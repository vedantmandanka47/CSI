import { z } from 'zod';
import { PaginationQuerySchema, createPaginatedResponseSchema, createSingleResponseSchema } from './common.schema.js';

export const MemberApplicationQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(['pending', 'active', 'inactive', 'all']).default('pending').optional(),
  branch: z.string().optional(),
  year: z.coerce.number().int().min(1).max(4).optional(),
});

export type MemberApplicationQuery = z.infer<typeof MemberApplicationQuerySchema>;

export const ApplicationActionSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});

export type ApplicationActionInput = z.infer<typeof ApplicationActionSchema>;

export const MemberApplicationDetailSchema = z.object({
  id: z.string().uuid(),
  enrollment_no: z.string().nullable().optional(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  status: z.string(),
  is_on_roster: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type MemberApplicationDetail = z.infer<typeof MemberApplicationDetailSchema>;

export const PaginatedMemberApplicationsResponseSchema =
  createPaginatedResponseSchema(MemberApplicationDetailSchema);

export const SingleMemberApplicationResponseSchema =
  createSingleResponseSchema(MemberApplicationDetailSchema);
