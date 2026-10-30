import { z } from 'zod';
import { createPaginatedResponseSchema, createSingleResponseSchema } from './common.schema.js';
import {
  AttendanceAudience,
  AttendanceMethod,
  RecipientType,
} from '../enums/domain.enum.js';

export const AttendanceStatus = {
  VERIFIED: 'verified',
  FLAGGED_CONFLICT: 'flagged_conflict',
  REJECTED: 'rejected',
} as const;

export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceSessionSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  name: z.string().min(2).max(100),
  audience: z.enum([
    AttendanceAudience.ALL,
    AttendanceAudience.PARTICIPANTS,
    AttendanceAudience.VOLUNTEERS,
    AttendanceAudience.SUBCORE,
    AttendanceAudience.CORE,
  ]),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  is_open: z.boolean(),
  totp_step_seconds: z.number().int().positive().default(30),
  created_by_id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  current_totp_code: z.string().optional(),
  verified_count: z.number().int().nonnegative().optional(),
});

export type AttendanceSession = z.infer<typeof AttendanceSessionSchema>;

export const CreateAttendanceSessionSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    audience: z
      .enum([
        AttendanceAudience.ALL,
        AttendanceAudience.PARTICIPANTS,
        AttendanceAudience.VOLUNTEERS,
        AttendanceAudience.SUBCORE,
        AttendanceAudience.CORE,
      ])
      .default(AttendanceAudience.ALL),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    is_open: z.boolean().default(true),
  })
  .refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
    message: 'ends_at must be later than starts_at',
    path: ['ends_at'],
  });

export type CreateAttendanceSessionInput = z.infer<typeof CreateAttendanceSessionSchema>;

export const CheckInQrSchema = z.object({
  session_id: z.string().uuid(),
  qr_token: z.string().min(10),
  client_uuid: z.string().min(16).max(64),
  client_marked_at: z.string().datetime().optional(),
});

export type CheckInQrInput = z.infer<typeof CheckInQrSchema>;

export const CheckInTotpSchema = z.object({
  session_id: z.string().uuid(),
  totp_code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
  member_id: z.string().uuid(),
  client_uuid: z.string().min(16).max(64),
  client_marked_at: z.string().datetime().optional(),
});

export type CheckInTotpInput = z.infer<typeof CheckInTotpSchema>;

export const CheckInManualSchema = z.object({
  session_id: z.string().uuid(),
  member_id: z.string().uuid(),
  notes: z.string().trim().min(3).max(500),
  client_uuid: z.string().min(16).max(64),
});

export type CheckInManualInput = z.infer<typeof CheckInManualSchema>;

export const AttendanceSyncOperationInputSchema = z.object({
  client_uuid: z.string().min(16).max(64),
  session_id: z.string().uuid(),
  method: z.enum([
    AttendanceMethod.QR_SCAN,
    AttendanceMethod.ROTATING_CODE,
    AttendanceMethod.MANUAL,
  ]),
  payload: z.string().min(1),
  member_id: z.string().uuid().optional(),
  client_marked_at: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

export type AttendanceSyncOperationInput = z.infer<typeof AttendanceSyncOperationInputSchema>;

export const BatchSyncAttendanceSchema = z.object({
  operations: z.array(AttendanceSyncOperationInputSchema).max(100),
});

export type BatchSyncAttendanceInput = z.infer<typeof BatchSyncAttendanceSchema>;

export const AttendanceSyncResultSchema = z.object({
  client_uuid: z.string(),
  status: z.enum([
    AttendanceStatus.VERIFIED,
    AttendanceStatus.FLAGGED_CONFLICT,
    AttendanceStatus.REJECTED,
  ]),
  message: z.string(),
  record_id: z.string().uuid().optional(),
});

export type AttendanceSyncResult = z.infer<typeof AttendanceSyncResultSchema>;

export const BatchSyncAttendanceResponseSchema = z.object({
  synced_count: z.number().int().nonnegative(),
  conflict_count: z.number().int().nonnegative(),
  rejected_count: z.number().int().nonnegative(),
  results: z.array(AttendanceSyncResultSchema),
});

export type BatchSyncAttendanceResponse = z.infer<typeof BatchSyncAttendanceResponseSchema>;

export const AttendanceRecordSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  event_id: z.string().uuid(),
  subject_type: z.enum([RecipientType.MEMBER, RecipientType.GUEST]),
  subject_id: z.string().uuid(),
  method: z.enum([
    AttendanceMethod.QR_SCAN,
    AttendanceMethod.ROTATING_CODE,
    AttendanceMethod.MANUAL,
  ]),
  status: z.enum([
    AttendanceStatus.VERIFIED,
    AttendanceStatus.FLAGGED_CONFLICT,
    AttendanceStatus.REJECTED,
  ]),
  client_uuid: z.string(),
  client_marked_at: z.string().datetime(),
  verified_at: z.string().datetime(),
  marked_by_id: z.string().uuid(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  member_name: z.string().optional(),
  enrollment_no: z.string().nullable().optional(),
});

export type AttendanceRecord = z.infer<typeof AttendanceRecordSchema>;

export const SingleAttendanceSessionResponseSchema = createSingleResponseSchema(AttendanceSessionSchema);
export const PaginatedAttendanceSessionsResponseSchema = createPaginatedResponseSchema(AttendanceSessionSchema);
export const SingleAttendanceRecordResponseSchema = createSingleResponseSchema(AttendanceRecordSchema);
export const PaginatedAttendanceRecordsResponseSchema = createPaginatedResponseSchema(AttendanceRecordSchema);
