import { z } from 'zod';

export const VerificationOutcome = {
  VALID: 'valid',
  REVOKED: 'revoked',
  INTEGRITY_MISMATCH: 'integrity_mismatch',
  NOT_FOUND: 'not_found',
  INVALID: 'invalid',
} as const;

export type VerificationOutcome = (typeof VerificationOutcome)[keyof typeof VerificationOutcome];

/**
 * Crockford Base32 Verification Code Regex:
 * Canonical 16 characters or formatted with hyphens (e.g. XXXX-XXXX-XXXX-XXXX).
 * Crockford Base32 alphabet: 0-9, A-H, J-K, M-N, P-T, V-Z (excludes I, L, O, U).
 */
export const CROCKFORD_BASE32_REGEX = /^[0-9A-HJKMNP-TV-Z]{16}$/i;
export const CROCKFORD_FORMATTED_REGEX = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/i;

export const VerificationCodeParamSchema = z
  .string({ required_error: 'Verification code is required' })
  .min(1, 'Verification code is required')
  .max(50, 'Verification code is too long');

export const PublicCertificateVerificationResponseSchema = z.object({
  status: z.enum([
    VerificationOutcome.VALID,
    VerificationOutcome.REVOKED,
    VerificationOutcome.INTEGRITY_MISMATCH,
    VerificationOutcome.NOT_FOUND,
    VerificationOutcome.INVALID,
  ]),
  isAuthentic: z.boolean(),
  certificateNumber: z.string().optional(),
  certificateType: z.string().optional(),
  recipientName: z.string().optional(),
  eventName: z.string().optional(),
  issueDate: z.string().optional(),
  issuedAt: z.string().optional(),
  issuingInstitution: z.string().optional(),
  revokedAt: z.string().optional(),
  revocationReason: z.string().optional(),
  message: z.string().optional(),
});

export type PublicCertificateVerificationResponse = z.infer<
  typeof PublicCertificateVerificationResponseSchema
>;

export const RevokeCertificateInputSchema = z.object({
  reason: z
    .string({ required_error: 'Revocation reason is required' })
    .trim()
    .min(5, 'Revocation reason must be at least 5 characters')
    .max(500, 'Revocation reason cannot exceed 500 characters'),
});

export type RevokeCertificateInput = z.infer<typeof RevokeCertificateInputSchema>;
