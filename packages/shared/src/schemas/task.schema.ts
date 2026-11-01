import { z } from 'zod';

export const TaskStatus = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
export const ALL_TASK_STATUSES = Object.values(TaskStatus) as [string, ...string[]];

export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];
export const ALL_TASK_PRIORITIES = Object.values(TaskPriority) as [string, ...string[]];

export const CreateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title cannot exceed 255 characters'),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(ALL_TASK_STATUSES).default(TaskStatus.TODO),
  priority: z.enum(ALL_TASK_PRIORITIES).default(TaskPriority.MEDIUM),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  assignedToId: z.string().uuid('Invalid assigned user ID').optional().nullable(),
  eventId: z.string().uuid('Invalid event ID').optional().nullable(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title cannot exceed 255 characters')
    .optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  status: z.enum(ALL_TASK_STATUSES).optional(),
  priority: z.enum(ALL_TASK_PRIORITIES).optional(),
  dueDate: z.string().datetime({ offset: true }).optional().nullable(),
  assignedToId: z.string().uuid('Invalid assigned user ID').optional().nullable(),
  eventId: z.string().uuid('Invalid event ID').optional().nullable(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const TaskUserSummarySchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string().email(),
});

export const TaskResponseSchema = z.object({
  id: z.string().uuid(),
  committeeId: z.string().uuid(),
  committeeCode: z.string().optional(),
  eventId: z.string().uuid().nullable().optional(),
  eventTitle: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(ALL_TASK_STATUSES),
  priority: z.enum(ALL_TASK_PRIORITIES),
  dueDate: z.string().nullable(),
  assignedToId: z.string().uuid().nullable(),
  assignedTo: TaskUserSummarySchema.nullable().optional(),
  createdById: z.string().uuid(),
  createdBy: TaskUserSummarySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.object({
  tasks: z.array(TaskResponseSchema),
  total: z.number().int().nonnegative(),
});

export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
