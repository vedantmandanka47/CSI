import { z } from 'zod';
import { createPaginatedResponseSchema, createSingleResponseSchema } from './common.schema.js';

export const DriveWindowSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  opens_at: z.string().datetime(),
  closes_at: z.string().datetime(),
  is_open: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type DriveWindow = z.infer<typeof DriveWindowSchema>;

export const CreateDriveWindowSchema = z
  .object({
    type: z.string().trim().min(2).max(50).default('membership'),
    opens_at: z.string().datetime(),
    closes_at: z.string().datetime(),
    is_open: z.boolean().default(true),
  })
  .refine((data) => new Date(data.closes_at) > new Date(data.opens_at), {
    message: 'closes_at must be later than opens_at',
    path: ['closes_at'],
  });

export type CreateDriveWindowInput = z.infer<typeof CreateDriveWindowSchema>;

export const UpdateDriveWindowSchema = z
  .object({
    opens_at: z.string().datetime().optional(),
    closes_at: z.string().datetime().optional(),
    is_open: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.opens_at && data.closes_at) {
        return new Date(data.closes_at) > new Date(data.opens_at);
      }
      return true;
    },
    {
      message: 'closes_at must be later than opens_at',
      path: ['closes_at'],
    },
  );

export type UpdateDriveWindowInput = z.infer<typeof UpdateDriveWindowSchema>;

export const ToggleDriveWindowSchema = z.object({
  is_open: z.boolean(),
});

export type ToggleDriveWindowInput = z.infer<typeof ToggleDriveWindowSchema>;

export const SingleDriveWindowResponseSchema = createSingleResponseSchema(DriveWindowSchema);
export const PaginatedDriveWindowsResponseSchema = createPaginatedResponseSchema(DriveWindowSchema);
