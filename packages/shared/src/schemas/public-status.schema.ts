import { z } from 'zod';

export const publicStatusResponseSchema = z.object({
  aggregates: z.object({
    active_members: z.number().int().nonnegative(),
    total_events: z.number().int().nonnegative(),
    certificates_issued: z.number().int().nonnegative(),
  }),
  membership_drive: z.object({
    is_open: z.boolean(),
    opens_at: z.string().nullable(),
    closes_at: z.string().nullable(),
    message: z.string(),
  }),
});

export type PublicStatusResponse = z.infer<typeof publicStatusResponseSchema>;

