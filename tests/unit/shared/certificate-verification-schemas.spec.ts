import { describe, it, expect } from 'vitest';
import {
  VerificationOutcome,
  PublicCertificateVerificationResponseSchema,
  RevokeCertificateInputSchema,
  CROCKFORD_BASE32_REGEX,
  CROCKFORD_FORMATTED_REGEX,
} from '@csi/shared';

describe('M13 Certificate Verification & Revocation Schemas', () => {
  it('should define all required verification outcome states', () => {
    expect(VerificationOutcome.VALID).toBe('valid');
    expect(VerificationOutcome.REVOKED).toBe('revoked');
    expect(VerificationOutcome.INTEGRITY_MISMATCH).toBe('integrity_mismatch');
    expect(VerificationOutcome.NOT_FOUND).toBe('not_found');
    expect(VerificationOutcome.INVALID).toBe('invalid');
  });

  describe('Crockford Base32 Regex', () => {
    it('should validate canonical 16-character Crockford Base32 codes', () => {
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDEF')).toBe(true);
      expect(CROCKFORD_BASE32_REGEX.test('GHJKMNPQRSTVWXYZ')).toBe(true);
      expect(CROCKFORD_BASE32_REGEX.test('4f7a9b2km8nqw3r5')).toBe(true); // case-insensitive regex
    });

    it('should reject ambiguous characters in canonical codes (I, L, O, U)', () => {
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDEI')).toBe(false); // contains I
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDEL')).toBe(false); // contains L
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDEO')).toBe(false); // contains O
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDEU')).toBe(false); // contains U
    });

    it('should reject invalid lengths', () => {
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDE')).toBe(false); // 15 chars
      expect(CROCKFORD_BASE32_REGEX.test('0123456789ABCDEF0')).toBe(false); // 17 chars
    });

    it('should validate formatted XXXX-XXXX-XXXX-XXXX Crockford Base32 codes', () => {
      expect(CROCKFORD_FORMATTED_REGEX.test('4F7A-9B2K-M8NQ-W3R5')).toBe(true);
      expect(CROCKFORD_FORMATTED_REGEX.test('4f7a-9b2k-m8nq-w3r5')).toBe(true);
    });

    it('should reject formatted codes containing ambiguous characters', () => {
      expect(CROCKFORD_FORMATTED_REGEX.test('4F7I-9B2K-M8NQ-W3R5')).toBe(false);
      expect(CROCKFORD_FORMATTED_REGEX.test('4F7A-9B2L-M8NQ-W3R5')).toBe(false);
    });
  });

  describe('PublicCertificateVerificationResponseSchema', () => {
    it('should validate a valid authentic certificate response', () => {
      const validPayload = {
        status: VerificationOutcome.VALID,
        isAuthentic: true,
        certificateNumber: 'CSI-2026-EVENT-PART-A1B2C3D4',
        certificateType: 'participation',
        recipientName: 'Vedant Mandanka',
        eventName: 'Full-Stack Web Development',
        issueDate: 'October 31, 2026',
        issuedAt: new Date().toISOString(),
        issuingInstitution: 'Computer Society of India - GCET Student Branch',
      };

      const result = PublicCertificateVerificationResponseSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should validate a revoked certificate response', () => {
      const revokedPayload = {
        status: VerificationOutcome.REVOKED,
        isAuthentic: false,
        certificateNumber: 'CSI-2026-EVENT-PART-A1B2C3D4',
        certificateType: 'participation',
        recipientName: 'Vedant Mandanka',
        eventName: 'Full-Stack Web Development',
        revokedAt: new Date().toISOString(),
        revocationReason: 'Duplicate entry issued in error',
        message: 'This certificate was revoked.',
      };

      const result = PublicCertificateVerificationResponseSchema.safeParse(revokedPayload);
      expect(result.success).toBe(true);
    });

    it('should validate not_found and invalid responses', () => {
      const notFoundPayload = {
        status: VerificationOutcome.NOT_FOUND,
        isAuthentic: false,
        message: 'No certificate found matching the provided verification code.',
      };
      expect(PublicCertificateVerificationResponseSchema.safeParse(notFoundPayload).success).toBe(true);

      const invalidPayload = {
        status: VerificationOutcome.INVALID,
        isAuthentic: false,
        message: 'The provided verification code format is invalid.',
      };
      expect(PublicCertificateVerificationResponseSchema.safeParse(invalidPayload).success).toBe(true);
    });
  });

  describe('RevokeCertificateInputSchema', () => {
    it('should accept valid revocation reasons', () => {
      const valid = { reason: 'Participant disqualified due to code of conduct violation.' };
      const parsed = RevokeCertificateInputSchema.parse(valid);
      expect(parsed.reason).toBe(valid.reason);
    });

    it('should reject reasons that are too short (< 5 characters)', () => {
      const result = RevokeCertificateInputSchema.safeParse({ reason: 'Err' });
      expect(result.success).toBe(false);
    });

    it('should reject reasons that exceed 500 characters', () => {
      const result = RevokeCertificateInputSchema.safeParse({ reason: 'A'.repeat(501) });
      expect(result.success).toBe(false);
    });
  });
});
