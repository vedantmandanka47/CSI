import { z } from 'zod';
import { UserStatus } from '../enums/domain.enum.js';
import { PaginationQuerySchema } from './common.schema.js';

export const UserStatusSchema = z.enum([
  UserStatus.PENDING,
  UserStatus.ACTIVE,
  UserStatus.INACTIVE,
  UserStatus.GRADUATED,
]);

export const UserSummarySchema = z.object({
  id: z.string().uuid(),
  enrollment_no: z.string().nullable(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().nullable(),
  branch: z.string().nullable(),
  year: z.number().int().min(1).max(4).nullable(),
  photo: z.string().nullable(),
  status: UserStatusSchema,
  created_at: z.string().or(z.date()),
});

export type UserSummary = z.infer<typeof UserSummarySchema>;

export const RoleAssignmentSummarySchema = z.object({
  id: z.string().uuid(),
  role_id: z.string().uuid(),
  role_code: z.string(),
  role_name: z.string(),
  committee_id: z.string().uuid().nullable(),
  committee_code: z.string().nullable(),
  committee_name: z.string().nullable(),
  term_start: z.string().or(z.date()),
  term_end: z.string().or(z.date()).nullable(),
});

export type RoleAssignmentSummary = z.infer<typeof RoleAssignmentSummarySchema>;

export const UserDetailSchema = UserSummarySchema.extend({
  role_assignments: z.array(RoleAssignmentSummarySchema),
  effective_roles: z.array(z.string()),
});

export type UserDetail = z.infer<typeof UserDetailSchema>;

export const UserQuerySchema = PaginationQuerySchema.extend({
  status: UserStatusSchema.optional(),
  role: z.string().optional(),
  committee: z.string().optional(),
});

export type UserQuery = z.infer<typeof UserQuerySchema>;

export const UpdateUserStatusSchema = z.object({
  status: UserStatusSchema,
  reason: z.string().max(255).optional(),
});

export type UpdateUserStatus = z.infer<typeof UpdateUserStatusSchema>;
