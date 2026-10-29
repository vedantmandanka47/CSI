import { z } from 'zod';

export const RosterEntrySchema = z.object({
  id: z.string().uuid(),
  academic_year: z.string().min(1).max(20),
  enrollment_no: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  branch: z.string().min(1).max(50),
  year: z.number().int().min(1).max(4),
  imported_at: z.string().or(z.date()),
});

export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const ImportRosterEntrySchema = z.object({
  enrollment_no: z.string().trim().min(1, 'Enrollment number is required').max(50),
  name: z.string().trim().min(1, 'Name is required').max(100),
  branch: z.string().trim().min(1, 'Branch is required').max(50),
  year: z.coerce.number().int().min(1).max(4),
});

export type ImportRosterEntry = z.infer<typeof ImportRosterEntrySchema>;

export const ImportRosterPayloadSchema = z.object({
  academic_year: z.string().trim().min(4, 'Academic year is required (e.g. 2025-2026)'),
  dry_run: z.boolean().default(false),
  entries: z.array(ImportRosterEntrySchema).min(1, 'At least one roster entry is required'),
});

export type ImportRosterPayload = z.infer<typeof ImportRosterPayloadSchema>;

