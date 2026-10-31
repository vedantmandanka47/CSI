import { describe, it, expect } from 'vitest';
import {
  CreateDriveWindowSchema,
  MemberApplicationQuerySchema,
  IdCardDataSchema,
  VerifyQrPassSchema,
} from '@csi/shared';

describe('M8 Shared Schemas (Drive Windows, Applications & ID Card)', () => {
  it('validates correct drive window payload', () => {
    const valid = {
      type: 'membership',
      opens_at: '2026-07-01T00:00:00.000Z',
      closes_at: '2026-09-30T23:59:59.000Z',
      is_open: true,
    };
    const parsed = CreateDriveWindowSchema.parse(valid);
    expect(parsed.type).toBe('membership');
    expect(parsed.is_open).toBe(true);
  });

  it('rejects drive window where closes_at is before opens_at', () => {
    const invalid = {
      type: 'membership',
      opens_at: '2026-10-01T00:00:00.000Z',
      closes_at: '2026-09-01T00:00:00.000Z',
      is_open: true,
    };
    const result = CreateDriveWindowSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates member application query parameters', () => {
    const query = {
      status: 'pending',
      branch: 'CP',
      year: '3',
      page: '1',
      per_page: '25',
    };
    const parsed = MemberApplicationQuerySchema.parse(query);
    expect(parsed.status).toBe('pending');
    expect(parsed.year).toBe(3);
    expect(parsed.per_page).toBe(25);
  });

  it('validates digital id card schema', () => {
    const validCard = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Aditya Patel',
      enrollment_no: '23010112001',
      email: 'aditya@gcet.ac.in',
      branch: 'Computer Engineering',
      year: 3,
      status: 'active',
      roles: ['member'],
      issued_at: '2026-07-01T00:00:00.000Z',
      valid_until: '2027-06-30T23:59:59.000Z',
      qr_token: 'csi_qr_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token',
      photo_url: null,
    };
    const parsed = IdCardDataSchema.parse(validCard);
    expect(parsed.name).toBe('Aditya Patel');
    expect(parsed.roles).toContain('member');
  });

  it('validates QR pass input schema', () => {
    expect(VerifyQrPassSchema.safeParse({ token: '123' }).success).toBe(false);
    expect(VerifyQrPassSchema.safeParse({ token: 'valid-token-string-12345' }).success).toBe(true);
  });
});
