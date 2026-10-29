import { z } from 'zod';

export const RoleSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string(),
  created_at: z.string().or(z.date()),
});

export type Role = z.infer<typeof RoleSchema>;

export const CommitteeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string(),
  created_at: z.string().or(z.date()),
});

export type Committee = z.infer<typeof CommitteeSchema>;
