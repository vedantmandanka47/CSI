import { z } from 'zod';
import { createSingleResponseSchema } from './common.schema.js';

export const IdCardDataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  enrollment_no: z.string().nullable().optional(),
  email: z.string().email(),
  branch: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  status: z.string(),
  roles: z.array(z.string()),
  issued_at: z.string().datetime(),
  valid_until: z.string().datetime(),
  qr_token: z.string().min(10),
  photo_url: z.string().nullable().optional(),
});

export type IdCardData = z.infer<typeof IdCardDataSchema>;

export const VerifyQrPassSchema = z.object({
  token: z.string().min(10, 'QR token is required'),
});

export type VerifyQrPassInput = z.infer<typeof VerifyQrPassSchema>;

export const VerifyQrPassResponseSchema = z.object({
  valid: z.boolean(),
  user_id: z.string().uuid().optional(),
  enrollment_no: z.string().optional(),
  name: z.string().optional(),
  roles: z.array(z.string()).optional(),
  message: z.string(),
});

export type VerifyQrPassResponse = z.infer<typeof VerifyQrPassResponseSchema>;

export const SingleIdCardResponseSchema = createSingleResponseSchema(IdCardDataSchema);
export const SingleVerifyQrPassResponseSchema = createSingleResponseSchema(VerifyQrPassResponseSchema);
