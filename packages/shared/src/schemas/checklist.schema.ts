import { z } from 'zod';
import { TaskUserSummarySchema } from './task.schema.js';

export const ChecklistRunStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SIGNED_OFF: 'signed_off',
} as const;

export type ChecklistRunStatus = (typeof ChecklistRunStatus)[keyof typeof ChecklistRunStatus];
export const ALL_CHECKLIST_RUN_STATUSES = Object.values(ChecklistRunStatus) as [string, ...string[]];

export const CreateChecklistItemInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Item title must be at least 2 characters')
    .max(255, 'Item title cannot exceed 255 characters'),
  description: z.string().trim().max(1000).optional().nullable(),
  assignedToId: z.string().uuid('Invalid assigned user ID').optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
});

export type CreateChecklistItemInput = z.infer<typeof CreateChecklistItemInputSchema>;

export const CreateChecklistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Checklist title must be at least 3 characters')
    .max(255, 'Checklist title cannot exceed 255 characters'),
  description: z.string().trim().max(4000).optional().nullable(),
  eventId: z.string().uuid('Invalid event ID').optional().nullable(),
  taskId: z.string().uuid('Invalid task ID').optional().nullable(),
  isTemplate: z.boolean().default(false),
  items: z.array(CreateChecklistItemInputSchema).optional(),
});

export type CreateChecklistInput = z.infer<typeof CreateChecklistSchema>;

export const UpdateChecklistItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Item title must be at least 2 characters')
    .max(255, 'Item title cannot exceed 255 characters')
    .optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  isCompleted: z.boolean().optional(),
  assignedToId: z.string().uuid('Invalid assigned user ID').optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
});

export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemSchema>;

export const CreateChecklistRunSchema = z.object({
  checklistId: z.string().uuid('Invalid checklist ID'),
  eventId: z.string().uuid('Invalid event ID').optional().nullable(),
});

export type CreateChecklistRunInput = z.infer<typeof CreateChecklistRunSchema>;

export const SignOffChecklistRunSchema = z.object({
  signOffNotes: z.string().trim().max(2000).optional().nullable(),
});

export type SignOffChecklistRunInput = z.infer<typeof SignOffChecklistRunSchema>;

export const ChecklistItemResponseSchema = z.object({
  id: z.string().uuid(),
  checklistId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  isCompleted: z.boolean(),
  completedAt: z.string().nullable(),
  completedById: z.string().uuid().nullable(),
  completedBy: TaskUserSummarySchema.nullable().optional(),
  assignedToId: z.string().uuid().nullable(),
  assignedTo: TaskUserSummarySchema.nullable().optional(),
  orderIndex: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChecklistItemResponse = z.infer<typeof ChecklistItemResponseSchema>;

export const ChecklistResponseSchema = z.object({
  id: z.string().uuid(),
  committeeId: z.string().uuid(),
  committeeCode: z.string().optional(),
  eventId: z.string().uuid().nullable().optional(),
  eventTitle: z.string().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  title: z.string(),
  description: z.string().nullable(),
  isTemplate: z.boolean(),
  items: z.array(ChecklistItemResponseSchema),
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  createdById: z.string().uuid(),
  createdBy: TaskUserSummarySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ChecklistResponse = z.infer<typeof ChecklistResponseSchema>;

export const ChecklistRunResponseSchema = z.object({
  id: z.string().uuid(),
  checklistId: z.string().uuid(),
  checklistTitle: z.string().optional(),
  committeeId: z.string().uuid(),
  committeeCode: z.string().optional(),
  eventId: z.string().uuid().nullable().optional(),
  eventTitle: z.string().nullable().optional(),
  status: z.enum(ALL_CHECKLIST_RUN_STATUSES),
  signedOffById: z.string().uuid().nullable(),
  signedOffBy: TaskUserSummarySchema.nullable().optional(),
  signedOffAt: z.string().nullable(),
  signOffNotes: z.string().nullable(),
  createdById: z.string().uuid(),
  createdBy: TaskUserSummarySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(ChecklistItemResponseSchema).optional(),
});

export type ChecklistRunResponse = z.infer<typeof ChecklistRunResponseSchema>;
