import { describe, it, expect } from 'vitest';
import {
  EventCategory,
  PublicEventSummarySchema,
  GuestRegisterSchema,
  canTransitionEvent,
  EventState,
} from '../src/index.js';

describe('Event Schemas & State Machine', () => {
  it('validates public event summary schema', () => {
    const validEvent = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      slug: 'intro-to-web3-workshop',
      title: 'Introduction to Web3 & Smart Contracts',
      description: 'Hands-on blockchain development workshop.',
      category: EventCategory.WORKSHOP,
      starts_at: '2026-11-15T10:00:00.000Z',
      ends_at: '2026-11-15T13:00:00.000Z',
      registration_opens_at: '2026-11-01T00:00:00.000Z',
      registration_closes_at: '2026-11-14T23:59:59.000Z',
      capacity: 50,
      state: EventState.PUBLISHED,
      poster_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97',
      venue: {
        id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        name: 'Auditorium 1',
        capacity: 100,
        map_url: 'https://maps.google.com/?q=GCET',
      },
      registered_count: 20,
      remaining_capacity: 30,
      is_full: false,
      is_registration_open: true,
    };

    const parsed = PublicEventSummarySchema.parse(validEvent);
    expect(parsed.slug).toBe('intro-to-web3-workshop');
    expect(parsed.remaining_capacity).toBe(30);
  });

  it('rejects guest registration without DPDP consent', () => {
    const invalidGuest = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      college: 'GCET',
      phone: '+919876543210',
      consent_data_processing: false,
    };

    const result = GuestRegisterSchema.safeParse(invalidGuest);
    expect(result.success).toBe(false);
  });

  it('accepts valid guest registration with DPDP consent', () => {
    const validGuest = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      college: 'GCET',
      phone: '+91 98765 43210',
      consent_data_processing: true,
    };

    const result = GuestRegisterSchema.safeParse(validGuest);
    expect(result.success).toBe(true);
  });

  it('validates event state machine transitions', () => {
    expect(canTransitionEvent(EventState.DRAFT, EventState.PUBLISHED)).toBe(true);
    expect(canTransitionEvent(EventState.PUBLISHED, EventState.REGISTRATION_OPEN)).toBe(true);
    expect(canTransitionEvent(EventState.REGISTRATION_OPEN, EventState.LIVE)).toBe(true);
    expect(canTransitionEvent(EventState.LIVE, EventState.COMPLETED)).toBe(true);
    expect(canTransitionEvent(EventState.COMPLETED, EventState.CERTIFIED)).toBe(true);

    // Invalid backwards or jump transitions
    expect(canTransitionEvent(EventState.DRAFT, EventState.COMPLETED)).toBe(false);
    expect(canTransitionEvent(EventState.CERTIFIED, EventState.DRAFT)).toBe(false);
    expect(canTransitionEvent(EventState.CANCELLED, EventState.PUBLISHED)).toBe(false);
  });
});
