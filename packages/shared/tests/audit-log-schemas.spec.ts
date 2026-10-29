import { describe, it, expect } from 'vitest';
import {
  AuditLogQuerySchema,
  AuditLogEntrySchema,
  AuditLogResponseSchema,
} from '../src/schemas/audit-log.schema.js';

describe('Audit Log Schemas (SEC-23)', () => {
  it('applies default pagination values for query', () => {
    const parsed = AuditLogQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.per_page).toBe(20);
  });

  it('validates query with action and actor_id filters', () => {
    const parsed = AuditLogQuerySchema.parse({
      page: '2',
      per_page: '50',
      action: 'AUTH_LOGIN_SUCCESS',
      actor_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      from_date: '2026-10-01T00:00:00.000Z',
    });

    expect(parsed.page).toBe(2);
    expect(parsed.per_page).toBe(50);
    expect(parsed.action).toBe('AUTH_LOGIN_SUCCESS');
    expect(parsed.actor_id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('rejects invalid UUID in actor_id', () => {
    expect(() =>
      AuditLogQuerySchema.parse({
        actor_id: 'not-a-uuid',
      }),
    ).toThrow();
  });

  it('validates audit log entry schema', () => {
    const entry = AuditLogEntrySchema.parse({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      actor_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      action: 'USER_STATUS_UPDATE',
      target_type: 'users',
      target_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      before_json: { status: 'pending' },
      after_json: { status: 'active' },
      ip: '127.0.0.1',
      created_at: new Date().toISOString(),
    });

    expect(entry.action).toBe('USER_STATUS_UPDATE');
    expect(entry.ip).toBe('127.0.0.1');
  });

  it('validates paginated audit log response', () => {
    const response = AuditLogResponseSchema.parse({
      data: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          actor_id: null,
          action: 'SYSTEM_BOOTSTRAP',
          target_type: null,
          target_id: null,
          before_json: null,
          after_json: null,
          ip: null,
          created_at: '2026-10-29T00:00:00.000Z',
        },
      ],
      meta: {
        page: 1,
        per_page: 20,
        total: 1,
        total_pages: 1,
      },
    });

    expect(response.data).toHaveLength(1);
    expect(response.meta.total).toBe(1);
  });
});

