import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EventState, RegistrationStatus, EventCategory } from '@csi/shared';

interface MockPrisma {
  event: {
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  venue: {
    findUnique: jest.Mock;
  };
  registration: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  eventGuest: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
}

describe('EventsService', () => {
  let service: EventsService;
  let mockPrisma: MockPrisma;

  const sampleEvent = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'web-security-workshop',
    title: 'Web Security & OWASP Top 10',
    description: 'Practical security workshop.',
    category: EventCategory.WORKSHOP,
    startsAt: new Date(Date.now() + 86400000), // tomorrow
    endsAt: new Date(Date.now() + 90000000),
    registrationOpensAt: new Date(Date.now() - 3600000),
    registrationClosesAt: new Date(Date.now() + 80000000),
    capacity: 2,
    state: EventState.PUBLISHED,
    posterUrl: 'https://example.com/poster.jpg',
    venue: {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Lab 301',
      capacity: 50,
      mapUrl: 'https://maps.google.com/?q=GCET',
    },
    _count: {
      registrations: 1,
      guests: 0,
    },
  };

  beforeEach(async () => {
    mockPrisma = {
      event: {
        findMany: jest.fn().mockResolvedValue([sampleEvent]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(sampleEvent),
        findUnique: jest.fn().mockResolvedValue(sampleEvent),
        create: jest.fn(),
        update: jest.fn(),
      },
      venue: {
        findUnique: jest.fn().mockResolvedValue({
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Lab 301',
          capacity: 50,
          isActive: true,
        }),
      },
      registration: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      eventGuest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('findPublicEvents', () => {
    it('returns filtered and paginated event list with capacity calculations', async () => {
      const result = await service.findPublicEvents({
        page: 1,
        per_page: 10,
        status: 'upcoming',
        category: 'workshop',
      });

      expect(result.data).toHaveLength(1);
      const event = result.data[0]!;
      expect(event.slug).toBe('web-security-workshop');
      expect(event.registered_count).toBe(1);
      expect(event.remaining_capacity).toBe(1);
      expect(event.is_full).toBe(false);
      expect(event.is_registration_open).toBe(true);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findPublicEventBySlug', () => {
    it('returns event detail and user registration status when user is registered', async () => {
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        status: RegistrationStatus.REGISTERED,
      });

      const result = await service.findPublicEventBySlug('web-security-workshop', 'user-123');

      expect(result.slug).toBe('web-security-workshop');
      expect(result.user_registration_status).toBe(RegistrationStatus.REGISTERED);
      expect(result.remaining_capacity).toBe(1);
    });

    it('throws NotFoundException when event is missing', async () => {
      mockPrisma.event.findFirst.mockResolvedValueOnce(null);

      await expect(service.findPublicEventBySlug('unknown-event')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('registerMember', () => {
    it('registers member when capacity is available under row lock', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: sampleEvent.id,
          capacity: 2,
          state: EventState.PUBLISHED,
          registration_opens_at: null,
          registration_closes_at: null,
        },
      ]);
      mockPrisma.registration.findUnique.mockResolvedValueOnce(null);
      mockPrisma.registration.count.mockResolvedValueOnce(1); // 1 registered so far
      mockPrisma.eventGuest.count.mockResolvedValueOnce(0);
      mockPrisma.registration.create.mockResolvedValueOnce({
        id: 'reg-new-1',
        registeredAt: new Date(),
      });

      const response = await service.registerMember(sampleEvent.id, 'user-123');

      expect(response.status).toBe(RegistrationStatus.REGISTERED);
      expect(response.message).toContain('confirmed successfully');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_REGISTER' }),
        }),
      );
    });

    it('places member on waitlist when event is at capacity', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: sampleEvent.id,
          capacity: 2,
          state: EventState.PUBLISHED,
          registration_opens_at: null,
          registration_closes_at: null,
        },
      ]);
      mockPrisma.registration.findUnique.mockResolvedValueOnce(null);
      mockPrisma.registration.count.mockResolvedValueOnce(2); // At capacity (2/2)
      mockPrisma.eventGuest.count.mockResolvedValueOnce(0);
      mockPrisma.registration.create.mockResolvedValueOnce({
        id: 'reg-waitlist-1',
        registeredAt: new Date(),
      });

      const response = await service.registerMember(sampleEvent.id, 'user-123');

      expect(response.status).toBe(RegistrationStatus.WAITLISTED);
      expect(response.message).toContain('placed on the waitlist');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_WAITLIST' }),
        }),
      );
    });

    it('rejects duplicate registration for already registered user', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: sampleEvent.id,
          capacity: 2,
          state: EventState.PUBLISHED,
          registration_opens_at: null,
          registration_closes_at: null,
        },
      ]);
      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'existing-reg',
        status: RegistrationStatus.REGISTERED,
      });

      await expect(service.registerMember(sampleEvent.id, 'user-123')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancelRegistration & waitlist promotion', () => {
    it('cancels registration and promotes earliest waitlisted attendee', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ id: sampleEvent.id, capacity: 2 }]) // Lock event
        .mockResolvedValueOnce([{ id: 'waitlist-user-row', user_id: 'waitlisted-user' }]); // Earliest waitlist

      mockPrisma.registration.findUnique.mockResolvedValueOnce({
        id: 'reg-to-cancel',
        status: RegistrationStatus.REGISTERED,
      });
      mockPrisma.registration.update.mockResolvedValue({});

      const result = await service.cancelRegistration(sampleEvent.id, 'cancelling-user');

      expect(result.message).toContain('successfully cancelled');
      expect(result.promoted_waitlist_id).toBe('waitlist-user-row');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'WAITLIST_PROMOTED_MEMBER' }),
        }),
      );
    });
  });

  describe('generateEventIcs & generateCalendarFeed', () => {
    it('generates valid RFC 5545 VCALENDAR structure', async () => {
      const { ics, slug } = await service.generateEventIcs('web-security-workshop');

      expect(slug).toBe('web-security-workshop');
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//CSI GCET Student Branch//Events Calendar//EN');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('SUMMARY:Web Security & OWASP Top 10');
      expect(ics).toContain('LOCATION:Lab 301');
      expect(ics).toContain('END:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
    });
  });

  describe('createEvent & updateEvent (M10)', () => {
    it('creates an event with venue validation and writes audit log', async () => {
      mockPrisma.event.findUnique.mockResolvedValueOnce(null); // No existing slug
      mockPrisma.venue.findUnique.mockResolvedValueOnce({
        id: 'venue-1',
        name: 'Seminar Hall',
        capacity: 100,
        isActive: true,
      });

      mockPrisma.event.create.mockResolvedValueOnce({
        id: 'new-event-id',
        slug: 'react-masterclass',
        title: 'React Masterclass',
        venueId: 'venue-1',
        startsAt: new Date('2026-11-20T10:00:00Z'),
        endsAt: new Date('2026-11-20T12:00:00Z'),
      });

      const res = await service.createEvent(
        {
          slug: 'react-masterclass',
          title: 'React Masterclass',
          description: 'Hands-on React workshop',
          category: 'workshop',
          venue_id: 'venue-1',
          starts_at: '2026-11-20T10:00:00Z',
          ends_at: '2026-11-20T12:00:00Z',
          capacity: 80,
          state: EventState.DRAFT,
        },
        'creator-user-id',
      );

      expect(res.id).toBe('new-event-id');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'EVENT_CREATED' }),
        }),
      );
    });

    it('rejects event creation when venue capacity is exceeded', async () => {
      mockPrisma.venue.findUnique.mockResolvedValueOnce({
        id: 'venue-small',
        name: 'Small Room',
        capacity: 30,
        isActive: true,
      });

      await expect(
        service.createEvent(
          {
            slug: 'large-conf',
            title: 'Large Conference',
            description: 'Too many attendees',
            category: 'seminar',
            venue_id: 'venue-small',
            starts_at: '2026-11-20T10:00:00Z',
            ends_at: '2026-11-20T12:00:00Z',
            capacity: 50,
          },
          'creator-user-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects event creation when venue is inactive', async () => {
      mockPrisma.venue.findUnique.mockResolvedValueOnce({
        id: 'venue-inactive',
        name: 'Closed Room',
        capacity: 100,
        isActive: false,
      });

      await expect(
        service.createEvent(
          {
            slug: 'event-inactive-venue',
            title: 'Event in Closed Room',
            description: 'Cannot book',
            category: 'workshop',
            venue_id: 'venue-inactive',
            starts_at: '2026-11-20T10:00:00Z',
            ends_at: '2026-11-20T12:00:00Z',
            capacity: 50,
          },
          'creator-user-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('catches PostgreSQL 23P01 exclusion violation and translates to ConflictException', async () => {
      mockPrisma.event.findUnique.mockResolvedValueOnce(null);
      mockPrisma.venue.findUnique.mockResolvedValueOnce({
        id: 'venue-1',
        name: 'Hall',
        capacity: 100,
        isActive: true,
      });

      const pgExclusionError = Object.assign(
        new Error('conflicting key value violates exclusion constraint "events_venue_time_excl"'),
        { code: '23P01' },
      );
      mockPrisma.event.create.mockRejectedValueOnce(pgExclusionError);

      await expect(
        service.createEvent(
          {
            slug: 'clashing-event',
            title: 'Clashing Event',
            description: 'Will conflict',
            category: 'workshop',
            venue_id: 'venue-1',
            starts_at: '2026-11-20T10:00:00Z',
            ends_at: '2026-11-20T12:00:00Z',
            capacity: 50,
          },
          'creator-user-id',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });
});
