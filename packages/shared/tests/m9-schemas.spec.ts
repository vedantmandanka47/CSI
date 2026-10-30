import { describe, it, expect } from 'vitest';
import {
  CreateAttendanceSessionSchema,
  CheckInQrSchema,
  CheckInTotpSchema,
  CheckInManualSchema,
  BatchSyncAttendanceSchema,
  MemberDashboardDataSchema,
  AttendanceAudience,
  AttendanceMethod,
} from '../src/index.js';

describe('M9 Shared Schemas (Attendance & Dashboard)', () => {
  it('validates correct attendance session creation payload', () => {
    const valid = {
      name: 'Workshop Morning Attendance',
      audience: AttendanceAudience.PARTICIPANTS,
      starts_at: '2026-11-01T09:00:00.000Z',
      ends_at: '2026-11-01T10:00:00.000Z',
      is_open: true,
    };
    const parsed = CreateAttendanceSessionSchema.parse(valid);
    expect(parsed.name).toBe('Workshop Morning Attendance');
    expect(parsed.audience).toBe('participants');
    expect(parsed.is_open).toBe(true);
  });

  it('rejects session where ends_at is before starts_at', () => {
    const invalid = {
      name: 'Invalid Session',
      audience: AttendanceAudience.ALL,
      starts_at: '2026-11-01T10:00:00.000Z',
      ends_at: '2026-11-01T09:00:00.000Z',
      is_open: true,
    };
    const result = CreateAttendanceSessionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates QR check-in input', () => {
    const valid = {
      session_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      qr_token: 'csi_pass.eyJzdWIiOiIxIn0.sig1234567890',
      client_uuid: '11111111-2222-3333-4444-555555555555',
    };
    const parsed = CheckInQrSchema.parse(valid);
    expect(parsed.session_id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('validates 6-digit TOTP code check-in input', () => {
    const valid = {
      session_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      totp_code: '849201',
      member_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      client_uuid: '22222222-3333-4444-5555-666666666666',
    };
    const parsed = CheckInTotpSchema.parse(valid);
    expect(parsed.totp_code).toBe('849201');

    const invalid = { ...valid, totp_code: '123' };
    expect(CheckInTotpSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates manual check-in input and requires notes', () => {
    const valid = {
      session_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      member_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      notes: 'ID card forgotten; verified student college photo ID',
      client_uuid: '33333333-4444-5555-6666-777777777777',
    };
    expect(CheckInManualSchema.safeParse(valid).success).toBe(true);

    const invalid = { ...valid, notes: ' ' };
    expect(CheckInManualSchema.safeParse(invalid).success).toBe(false);
  });

  it('validates offline batch synchronization payload', () => {
    const batch = {
      operations: [
        {
          client_uuid: '44444444-5555-6666-7777-888888888888',
          session_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          method: AttendanceMethod.QR_SCAN,
          payload: 'csi_pass.eyJzdWIiOiIxIn0.sig',
          client_marked_at: '2026-11-01T09:15:00.000Z',
        },
      ],
    };
    const parsed = BatchSyncAttendanceSchema.parse(batch);
    expect(parsed.operations).toHaveLength(1);
    expect(parsed.operations[0]?.method).toBe('qr_scan');
  });

  it('validates member self-service dashboard schema', () => {
    const dashboard = {
      profile: {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Jane Doe',
        enrollment_no: '23CS101',
        email: 'jane@gcet.edu.in',
        branch: 'Computer Engineering',
        year: 2,
        status: 'active',
        roles: ['member'],
        valid_until: '2027-06-30T23:59:59.000Z',
      },
      statistics: {
        total_registered_events: 5,
        attended_events_count: 4,
        attendance_percentage: 80,
        certificates_count: 0,
      },
      upcoming_events: [
        {
          registration_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          event_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          slug: 'hackathon-2026',
          title: 'CSI Annual Hackathon 2026',
          category: 'hackathon',
          starts_at: '2026-11-15T09:00:00.000Z',
          ends_at: '2026-11-15T18:00:00.000Z',
          venue_name: 'Auditorium 1',
          status: 'registered',
        },
      ],
      past_registrations: [],
      recent_activity: [
        {
          id: 'act-1',
          type: 'registration',
          title: 'Registered for CSI Annual Hackathon 2026',
          description: 'Registration confirmed as Participant',
          timestamp: '2026-10-28T10:00:00.000Z',
        },
      ],
    };

    const parsed = MemberDashboardDataSchema.parse(dashboard);
    expect(parsed.profile.name).toBe('Jane Doe');
    expect(parsed.statistics.attendance_percentage).toBe(80);
    expect(parsed.upcoming_events).toHaveLength(1);
  });
});
