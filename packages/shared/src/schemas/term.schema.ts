import { z } from 'zod';

export const TermStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const;

export type TermStatus = (typeof TermStatus)[keyof typeof TermStatus];

export const TermStatusSchema = z.enum([
  TermStatus.DRAFT,
  TermStatus.ACTIVE,
  TermStatus.ARCHIVED,
]);

export const CreateAcademicTermSchema = z
  .object({
    name: z.string().min(3, 'Term name must be at least 3 characters').max(100),
    code: z
      .string()
      .min(3, 'Term code must be at least 3 characters')
      .max(50)
      .regex(/^[A-Za-z0-9_-]+$/, 'Term code can only contain alphanumeric characters, underscores, and hyphens'),
    startDate: z.string().datetime({ message: 'Start date must be a valid ISO datetime' }),
    endDate: z.string().datetime({ message: 'End date must be a valid ISO datetime' }),
  })
  .refine((data) => new Date(data.startDate) < new Date(data.endDate), {
    message: 'Start date must be strictly before end date',
    path: ['endDate'],
  });

export type CreateAcademicTermInput = z.infer<typeof CreateAcademicTermSchema>;

export const UpdateAcademicTermSchema = z
  .object({
    name: z.string().min(3).max(100).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    status: TermStatusSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) < new Date(data.endDate);
      }
      return true;
    },
    {
      message: 'Start date must be strictly before end date',
      path: ['endDate'],
    },
  );

export type UpdateAcademicTermInput = z.infer<typeof UpdateAcademicTermSchema>;

export const AcademicTermResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: TermStatusSchema,
  isCurrent: z.boolean(),
  archivedAt: z.string().nullable().optional(),
  createdById: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  activeAppointmentsCount: z.number().int().optional(),
  eventsCount: z.number().int().optional(),
});

export type AcademicTermResponse = z.infer<typeof AcademicTermResponseSchema>;

export const AcademicTermListResponseSchema = z.object({
  data: z.array(AcademicTermResponseSchema),
  currentTerm: AcademicTermResponseSchema.nullable().optional(),
});

export type AcademicTermListResponse = z.infer<typeof AcademicTermListResponseSchema>;
