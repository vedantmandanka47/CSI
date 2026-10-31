import { describe, it, expect } from 'vitest';
import {
  CreateVenueSchema,
  UpdateVenueSchema,
  CheckConflictSchema,
  CreateEventSchema,
  AvCapability,
  EventState,
} from '@csi/shared';

describe('M10 Venue & Conflict Schemas', () => {
  it('validates valid CreateVenue input with default flags and AV capabilities', () => {
    const validVenue = {
      name: 'Auditorium A',
      building: 'Main Block',
      room_number: 'AUD-01',
      capacity: 250,
      av_capabilities: [AvCapability.PROJECTOR, AvCapability.AUDIO_SYSTEM, AvCapability.MICROPHONE],
    };

    const parsed = CreateVenueSchema.parse(validVenue);
    expect(parsed.name).toBe('Auditorium A');
    expect(parsed.capacity).toBe(250);
    expect(parsed.is_available).toBe(true);
    expect(parsed.is_active).toBe(true);
    expect(parsed.av_capabilities).toHaveLength(3);
  });

  it('rejects venue with non-positive capacity', () => {
    const invalidVenue = {
      name: 'Lab 1',
      building: 'IT Block',
      capacity: 0,
    };

    expect(() => CreateVenueSchema.parse(invalidVenue)).toThrow(/positive integer/i);

    const negativeCapacity = {
      name: 'Lab 1',
      building: 'IT Block',
      capacity: -5,
    };
    expect(() => CreateVenueSchema.parse(negativeCapacity)).toThrow(/positive integer/i);
  });

  it('rejects venue with missing required building or short name', () => {
    expect(() =>
      CreateVenueSchema.parse({
        name: 'A',
        building: 'Main',
        capacity: 30,
      }),
    ).toThrow();

    expect(() =>
      CreateVenueSchema.parse({
        name: 'Auditorium',
        building: '',
        capacity: 30,
      }),
    ).toThrow();
  });

  it('allows partial UpdateVenue updates and rejects negative capacity', () => {
    const partial = UpdateVenueSchema.parse({
      capacity: 150,
      is_available: false,
    });
    expect(partial.capacity).toBe(150);
    expect(partial.is_available).toBe(false);

    expect(() => UpdateVenueSchema.parse({ capacity: 0 })).toThrow(/positive integer/i);
  });

  it('validates CheckConflictSchema with valid time interval', () => {
    const validConflictCheck = {
      venue_id: '11111111-1111-1111-1111-111111111111',
      starts_at: '2026-11-15T10:00:00.000Z',
      ends_at: '2026-11-15T12:00:00.000Z',
    };

    const parsed = CheckConflictSchema.parse(validConflictCheck);
    expect(parsed.venue_id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects CheckConflictSchema when ends_at <= starts_at', () => {
    const reversedInterval = {
      venue_id: '11111111-1111-1111-1111-111111111111',
      starts_at: '2026-11-15T12:00:00.000Z',
      ends_at: '2026-11-15T10:00:00.000Z',
    };
    expect(() => CheckConflictSchema.parse(reversedInterval)).toThrow(/must be after start time/i);

    const equalInterval = {
      venue_id: '11111111-1111-1111-1111-111111111111',
      starts_at: '2026-11-15T10:00:00.000Z',
      ends_at: '2026-11-15T10:00:00.000Z',
    };
    expect(() => CheckConflictSchema.parse(equalInterval)).toThrow(/must be after start time/i);
  });

  it('validates CreateEventSchema with venue and time order enforcement', () => {
    const validEvent = {
      slug: 'intro-to-rust',
      title: 'Introduction to Rust',
      description: 'Comprehensive hands-on workshop on systems programming in Rust.',
      category: 'workshop',
      venue_id: '11111111-1111-1111-1111-111111111111',
      starts_at: '2026-11-10T09:00:00.000Z',
      ends_at: '2026-11-10T12:00:00.000Z',
      capacity: 60,
      state: EventState.DRAFT,
    };

    const parsed = CreateEventSchema.parse(validEvent);
    expect(parsed.slug).toBe('intro-to-rust');
    expect(parsed.capacity).toBe(60);

    const invalidEvent = {
      ...validEvent,
      starts_at: '2026-11-10T12:00:00.000Z',
      ends_at: '2026-11-10T09:00:00.000Z',
    };
    expect(() => CreateEventSchema.parse(invalidEvent)).toThrow(/must be after start time/i);
  });
});

