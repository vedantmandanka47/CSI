import { describe, it, expect } from 'vitest';
import { publicStatusResponseSchema } from '@csi/shared';

describe('PublicStatusSchema', () => {
  it('validates a valid public status payload', () => {
    const validData = {
      aggregates: {
        active_members: 42,
        total_events: 12,
        certificates_issued: 85,
      },
      membership_drive: {
        is_open: true,
        opens_at: '2026-08-01T00:00:00.000Z',
        closes_at: '2026-09-30T23:59:59.000Z',
        message: 'Annual student branch membership drive is currently active.',
      },
    };

    const parsed = publicStatusResponseSchema.parse(validData);
    expect(parsed.aggregates.active_members).toBe(42);
    expect(parsed.membership_drive.is_open).toBe(true);
  });

  it('rejects negative counts in aggregates', () => {
    const invalidData = {
      aggregates: {
        active_members: -1,
        total_events: 0,
        certificates_issued: 0,
      },
      membership_drive: {
        is_open: false,
        opens_at: null,
        closes_at: null,
        message: 'Membership drive is currently closed.',
      },
    };

    expect(() => publicStatusResponseSchema.parse(invalidData)).toThrow();
  });
});

