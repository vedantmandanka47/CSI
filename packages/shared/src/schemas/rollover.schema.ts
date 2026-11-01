import { z } from 'zod';
import { RoleCode } from '../enums/role.enum.js';
import { AcademicTermResponseSchema } from './term.schema.js';

export const IncomingAppointmentInputSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  roleCode: z.nativeEnum(RoleCode),
  committeeCode: z.string().optional().nullable(),
});

export type IncomingAppointmentInput = z.infer<typeof IncomingAppointmentInputSchema>;

export const RolloverPreviewRequestSchema = z.object({
  fromTermId: z.string().uuid().optional().nullable(),
  toTermId: z.string().uuid('Target term ID is required'),
  incomingAppointments: z.array(IncomingAppointmentInputSchema).default([]),
  archiveOpenTasks: z.boolean().default(true),
  transitionGraduatingMembers: z.boolean().default(true),
});

export type RolloverPreviewRequest = z.infer<typeof RolloverPreviewRequestSchema>;

export const OutgoingAppointmentSummarySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string(),
  userEmail: z.string().email(),
  roleCode: z.string(),
  roleName: z.string(),
  committeeCode: z.string().nullable().optional(),
  committeeName: z.string().nullable().optional(),
  termStart: z.string(),
  termEnd: z.string().nullable().optional(),
});

export type OutgoingAppointmentSummary = z.infer<typeof OutgoingAppointmentSummarySchema>;

export const GraduatingMemberSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  year: z.number().int().nullable().optional(),
  branch: z.string().nullable().optional(),
  currentRoles: z.array(z.string()),
});

export type GraduatingMemberSummary = z.infer<typeof GraduatingMemberSummarySchema>;

export const UnresolvedWorkflowsSummarySchema = z.object({
  openTasks: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      committeeCode: z.string(),
      status: z.string(),
      priority: z.string(),
    }),
  ),
  openChecklistRuns: z.array(
    z.object({
      id: z.string().uuid(),
      checklistTitle: z.string(),
      committeeCode: z.string(),
      status: z.string(),
    }),
  ),
  pendingAssets: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      committeeCode: z.string(),
      status: z.string(),
    }),
  ),
});

export type UnresolvedWorkflowsSummary = z.infer<typeof UnresolvedWorkflowsSummarySchema>;

export const IncomingAppointmentValidationSchema = z.object({
  userId: z.string().uuid(),
  userName: z.string().optional(),
  roleCode: z.string(),
  committeeCode: z.string().nullable().optional(),
  isValid: z.boolean(),
  error: z.string().optional(),
});

export type IncomingAppointmentValidation = z.infer<typeof IncomingAppointmentValidationSchema>;

export const RolloverPreviewResponseSchema = z.object({
  fromTerm: AcademicTermResponseSchema.nullable().optional(),
  toTerm: AcademicTermResponseSchema,
  outgoingAppointments: z.array(OutgoingAppointmentSummarySchema),
  graduatingMembers: z.array(GraduatingMemberSummarySchema),
  unresolvedWorkflows: UnresolvedWorkflowsSummarySchema,
  incomingAppointmentsValidation: z.array(IncomingAppointmentValidationSchema),
  canExecute: z.boolean(),
  blockingReasons: z.array(z.string()),
  warnings: z.array(z.string()),
  suggestedConfirmationCode: z.string(),
});

export type RolloverPreviewResponse = z.infer<typeof RolloverPreviewResponseSchema>;

export const ExecuteRolloverRequestSchema = z.object({
  fromTermId: z.string().uuid().optional().nullable(),
  toTermId: z.string().uuid('Target term ID is required'),
  incomingAppointments: z.array(IncomingAppointmentInputSchema).default([]),
  archiveOpenTasks: z.boolean().default(true),
  transitionGraduatingMembers: z.boolean().default(true),
  notes: z.string().max(1000).optional().nullable(),
  confirmationCode: z.string().min(1, 'Confirmation code is required'),
});

export type ExecuteRolloverRequest = z.infer<typeof ExecuteRolloverRequestSchema>;

export const RolloverExecutionResponseSchema = z.object({
  success: z.boolean(),
  rolloverId: z.string().uuid(),
  executedAt: z.string(),
  summary: z.object({
    fromTermId: z.string().uuid().nullable().optional(),
    fromTermCode: z.string().nullable().optional(),
    toTermId: z.string().uuid().optional(),
    toTermCode: z.string(),
    outgoingRolesClosedCount: z.number().int(),
    graduatingMembersCount: z.number().int(),
    incomingRolesCreatedCount: z.number().int(),
    tasksArchivedCount: z.number().int(),
    snapshotId: z.string().uuid().nullable().optional(),
  }),
});

export type RolloverExecutionResponse = z.infer<typeof RolloverExecutionResponseSchema>;

export const TermSnapshotResponseSchema = z.object({
  id: z.string().uuid(),
  termId: z.string().uuid(),
  termCode: z.string(),
  termName: z.string(),
  capturedAt: z.string(),
  capturedById: z.string().uuid(),
  capturedByName: z.string().optional(),
  metrics: z.object({
    totalEvents: z.number().int(),
    totalAttendance: z.number().int(),
    totalCertificatesIssued: z.number().int(),
    totalPassportsGenerated: z.number().int(),
    totalTasksCompleted: z.number().int(),
    totalTasksArchived: z.number().int(),
    totalChecklistsSignedOff: z.number().int(),
    totalAssetsApproved: z.number().int(),
    activeMembersCount: z.number().int(),
  }),
  rosterSnapshot: z.array(
    z.object({
      memberName: z.string(),
      memberEmail: z.string(),
      roleName: z.string(),
      roleCode: z.string(),
      committeeName: z.string().nullable().optional(),
      committeeCode: z.string().nullable().optional(),
    }),
  ),
});

export type TermSnapshotResponse = z.infer<typeof TermSnapshotResponseSchema>;

export const RolloverHistoryItemSchema = z.object({
  id: z.string().uuid(),
  fromTermId: z.string().uuid().nullable().optional(),
  fromTermCode: z.string().nullable().optional(),
  toTermId: z.string().uuid(),
  toTermCode: z.string(),
  executedById: z.string().uuid(),
  executedByName: z.string().optional(),
  executedAt: z.string(),
  status: z.string(),
  summary: z.record(z.any()),
  notes: z.string().nullable().optional(),
});

export type RolloverHistoryItem = z.infer<typeof RolloverHistoryItemSchema>;

export const RolloverHistoryResponseSchema = z.object({
  data: z.array(RolloverHistoryItemSchema),
});

export type RolloverHistoryResponse = z.infer<typeof RolloverHistoryResponseSchema>;
