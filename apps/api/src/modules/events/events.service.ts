import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  EventListQuery,
  PublicEventSummary,
  PublicEventDetail,
  GuestRegisterInput,
  RegistrationResponse,
  EventState,
  RegistrationStatus,
  ErrorCode,
} from '@csi/shared';

interface LockedEventRow {
  id: string;
  capacity: number;
  state: string;
  registration_opens_at: Date | null;
  registration_closes_at: Date | null;
  starts_at?: Date;
  ends_at?: Date;
}

interface WaitlistMemberRow {
  id: string;
  user_id: string;
}

interface WaitlistGuestRow {
  id: string;
  email: string;
}

interface CalendarEventItem {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  state: string;
  venue?: { name?: string | null } | null;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public list of published events with category/status filtering, search, and pagination.
   */
  async findPublicEvents(query: EventListQuery): Promise<{
    data: PublicEventSummary[];
    meta: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const skip = (page - 1) * perPage;
    const now = new Date();

    const where: Prisma.EventWhereInput = {};

    // Never show draft or cancelled events to the public
    if (query.status === 'past') {
      where.OR = [
        { state: { in: [EventState.COMPLETED, EventState.CERTIFIED] } },
        { endsAt: { lt: now }, state: { in: [EventState.PUBLISHED, EventState.REGISTRATION_OPEN, EventState.LIVE] } },
      ];
    } else if (query.status === 'upcoming') {
      where.state = { in: [EventState.PUBLISHED, EventState.REGISTRATION_OPEN, EventState.LIVE] };
      where.endsAt = { gte: now };
    } else {
      // 'all' public
      where.state = { in: [EventState.PUBLISHED, EventState.REGISTRATION_OPEN, EventState.LIVE, EventState.COMPLETED, EventState.CERTIFIED] };
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.from) {
      where.startsAt = { ...((where.startsAt as Prisma.DateTimeFilter) || {}), gte: new Date(query.from) };
    }
    if (query.to) {
      where.endsAt = { ...((where.endsAt as Prisma.DateTimeFilter) || {}), lte: new Date(query.to) };
    }

    if (query.q) {
      where.AND = [
        ...((where.AND as Prisma.EventWhereInput[]) || []),
        {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const orderBy = query.status === 'past' ? { startsAt: 'desc' as const } : { startsAt: 'asc' as const };

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          venue: true,
          _count: {
            select: {
              registrations: { where: { status: RegistrationStatus.REGISTERED } },
              guests: { where: { status: RegistrationStatus.REGISTERED } },
            },
          },
        },
        skip,
        take: perPage,
        orderBy,
      }),
      this.prisma.event.count({ where }),
    ]);

    const data: PublicEventSummary[] = events.map((event) => {
      const registeredCount = event._count.registrations + event._count.guests;
      const remainingCapacity = Math.max(0, event.capacity - registeredCount);
      const isFull = remainingCapacity === 0;

      const isRegistrationOpen =
        event.state === EventState.REGISTRATION_OPEN ||
        (event.state === EventState.PUBLISHED &&
          (!event.registrationOpensAt || event.registrationOpensAt <= now) &&
          (!event.registrationClosesAt || event.registrationClosesAt >= now));

      return {
        id: event.id,
        slug: event.slug,
        title: event.title,
        description: event.description,
        category: event.category,
        starts_at: event.startsAt.toISOString(),
        ends_at: event.endsAt.toISOString(),
        registration_opens_at: event.registrationOpensAt?.toISOString() || null,
        registration_closes_at: event.registrationClosesAt?.toISOString() || null,
        capacity: event.capacity,
        state: event.state as EventState,
        poster_url: event.posterUrl,
        venue: event.venue
          ? {
              id: event.venue.id,
              name: event.venue.name,
              capacity: event.venue.capacity,
              map_url: event.venue.mapUrl,
            }
          : null,
        registered_count: registeredCount,
        remaining_capacity: remainingCapacity,
        is_full: isFull,
        is_registration_open: isRegistrationOpen,
      };
    });

    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    };
  }

  /**
   * Public event details by slug (or UUID) with optional authenticated user registration status.
   */
  async findPublicEventBySlug(slugOrId: string, currentUserId?: string): Promise<PublicEventDetail> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    const event = await this.prisma.event.findFirst({
      where: {
        OR: isUuid ? [{ id: slugOrId }, { slug: slugOrId }] : [{ slug: slugOrId }],
        state: { in: [EventState.PUBLISHED, EventState.REGISTRATION_OPEN, EventState.LIVE, EventState.COMPLETED, EventState.CERTIFIED] },
      },
      include: {
        venue: true,
        _count: {
          select: {
            registrations: { where: { status: RegistrationStatus.REGISTERED } },
            guests: { where: { status: RegistrationStatus.REGISTERED } },
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.EVENT_NOT_FOUND,
        message: 'The requested event was not found or is not publicly accessible.',
      });
    }

    const now = new Date();
    const registeredCount = event._count.registrations + event._count.guests;
    const remainingCapacity = Math.max(0, event.capacity - registeredCount);
    const isFull = remainingCapacity === 0;

    const isRegistrationOpen =
      event.state === EventState.REGISTRATION_OPEN ||
      (event.state === EventState.PUBLISHED &&
        (!event.registrationOpensAt || event.registrationOpensAt <= now) &&
        (!event.registrationClosesAt || event.registrationClosesAt >= now));

    let userRegistrationStatus: RegistrationStatus | null = null;
    if (currentUserId) {
      const reg = await this.prisma.registration.findUnique({
        where: {
          event_user_unique: {
            eventId: event.id,
            userId: currentUserId,
          },
        },
      });
      if (reg) {
        userRegistrationStatus = reg.status as RegistrationStatus;
      }
    }

    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      category: event.category,
      starts_at: event.startsAt.toISOString(),
      ends_at: event.endsAt.toISOString(),
      registration_opens_at: event.registrationOpensAt?.toISOString() || null,
      registration_closes_at: event.registrationClosesAt?.toISOString() || null,
      capacity: event.capacity,
      state: event.state as EventState,
      poster_url: event.posterUrl,
      venue: event.venue
        ? {
            id: event.venue.id,
            name: event.venue.name,
            capacity: event.venue.capacity,
            map_url: event.venue.mapUrl,
          }
        : null,
      registered_count: registeredCount,
      remaining_capacity: remainingCapacity,
      is_full: isFull,
      is_registration_open: isRegistrationOpen,
      user_registration_status: userRegistrationStatus,
    };
  }

  /**
   * Concurrency-safe authenticated member registration.
   * Uses SELECT ... FOR UPDATE to avoid overselling under concurrent requests (INT-05).
   */
  async registerMember(eventId: string, userId: string, notes?: string): Promise<RegistrationResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock event row
      const lockedRows = (await tx.$queryRaw`
        SELECT id, capacity, state, registration_opens_at, registration_closes_at, starts_at, ends_at
        FROM events
        WHERE id = ${eventId}::uuid
        FOR UPDATE;
      `) as LockedEventRow[];

      if (!lockedRows || lockedRows.length === 0) {
        throw new NotFoundException({
          code: ErrorCode.EVENT_NOT_FOUND,
          message: 'Event not found.',
        });
      }

      const event = lockedRows[0]!;
      const now = new Date();

      if (event.state === EventState.CANCELLED || event.state === EventState.DRAFT) {
        throw new BadRequestException({
          code: ErrorCode.EVENT_NOT_LIVE,
          message: 'Registrations are not accepted for this event.',
        });
      }

      // Check registration window if defined
      if (event.registration_opens_at && new Date(event.registration_opens_at) > now) {
        throw new BadRequestException({
          code: ErrorCode.REGISTRATION_CLOSED,
          message: 'Registration for this event has not opened yet.',
        });
      }
      if (event.registration_closes_at && new Date(event.registration_closes_at) < now) {
        throw new BadRequestException({
          code: ErrorCode.REGISTRATION_CLOSED,
          message: 'Registration for this event is closed.',
        });
      }

      // 2. Check existing user registration
      const existing = await tx.registration.findUnique({
        where: {
          event_user_unique: {
            eventId,
            userId,
          },
        },
      });

      if (existing) {
        if (existing.status === RegistrationStatus.REGISTERED) {
          throw new ConflictException({
            code: ErrorCode.ALREADY_REGISTERED,
            message: 'You are already registered for this event.',
          });
        }
        if (existing.status === RegistrationStatus.WAITLISTED) {
          throw new ConflictException({
            code: ErrorCode.ALREADY_REGISTERED,
            message: 'You are already on the waitlist for this event.',
          });
        }
      }

      // 3. Count active registrations under lock
      const memberCount = await tx.registration.count({
        where: { eventId, status: RegistrationStatus.REGISTERED },
      });
      const guestCount = await tx.eventGuest.count({
        where: { eventId, status: RegistrationStatus.REGISTERED },
      });
      const totalRegistered = memberCount + guestCount;

      const isCapacityAvailable = totalRegistered < event.capacity;
      const targetStatus = isCapacityAvailable ? RegistrationStatus.REGISTERED : RegistrationStatus.WAITLISTED;
      const message = isCapacityAvailable
        ? 'Registration confirmed successfully.'
        : 'Event capacity reached. You have been placed on the waitlist.';

      let record;
      if (existing) {
        // Re-activating cancelled registration
        record = await tx.registration.update({
          where: { id: existing.id },
          data: {
            status: targetStatus,
            registeredAt: now,
            cancelledAt: null,
          },
        });
      } else {
        record = await tx.registration.create({
          data: {
            eventId,
            userId,
            status: targetStatus,
            registeredAt: now,
          },
        });
      }

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: targetStatus === RegistrationStatus.REGISTERED ? 'EVENT_REGISTER' : 'EVENT_WAITLIST',
          targetType: 'event',
          targetId: eventId,
          afterJson: {
            registration_id: record.id,
            status: targetStatus,
            total_registered_at_time: totalRegistered + 1,
            capacity: event.capacity,
            notes: notes || null,
          },
        },
      });

      return {
        id: record.id,
        event_id: eventId,
        user_id: userId,
        status: targetStatus,
        registered_at: record.registeredAt.toISOString(),
        message,
      };
    });
  }

  /**
   * Concurrency-safe guest registration.
   */
  async registerGuest(eventId: string, input: GuestRegisterInput, ip?: string): Promise<RegistrationResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock event row
      const lockedRows = (await tx.$queryRaw`
        SELECT id, capacity, state, registration_opens_at, registration_closes_at
        FROM events
        WHERE id = ${eventId}::uuid
        FOR UPDATE;
      `) as LockedEventRow[];

      if (!lockedRows || lockedRows.length === 0) {
        throw new NotFoundException({
          code: ErrorCode.EVENT_NOT_FOUND,
          message: 'Event not found.',
        });
      }

      const event = lockedRows[0]!;
      const now = new Date();

      if (event.state === EventState.CANCELLED || event.state === EventState.DRAFT) {
        throw new BadRequestException({
          code: ErrorCode.EVENT_NOT_LIVE,
          message: 'Registrations are not accepted for this event.',
        });
      }

      // Check existing guest registration by email
      const existing = await tx.eventGuest.findUnique({
        where: {
          event_guest_unique: {
            eventId,
            email: input.email,
          },
        },
      });

      if (existing) {
        throw new ConflictException({
          code: ErrorCode.ALREADY_REGISTERED,
          message: 'A guest with this email is already registered for this event.',
        });
      }

      // Count active registrations
      const memberCount = await tx.registration.count({
        where: { eventId, status: RegistrationStatus.REGISTERED },
      });
      const guestCount = await tx.eventGuest.count({
        where: { eventId, status: RegistrationStatus.REGISTERED },
      });
      const totalRegistered = memberCount + guestCount;

      const isCapacityAvailable = totalRegistered < event.capacity;
      const targetStatus = isCapacityAvailable ? RegistrationStatus.REGISTERED : RegistrationStatus.WAITLISTED;
      const message = isCapacityAvailable
        ? 'Guest registration confirmed successfully.'
        : 'Event capacity reached. You have been placed on the guest waitlist.';

      const record = await tx.eventGuest.create({
        data: {
          eventId,
          name: input.name,
          email: input.email,
          college: input.college,
          phone: input.phone,
          status: targetStatus,
          consentAt: now,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: targetStatus === RegistrationStatus.REGISTERED ? 'GUEST_EVENT_REGISTER' : 'GUEST_EVENT_WAITLIST',
          targetType: 'event',
          targetId: eventId,
          ip: ip || null,
          afterJson: {
            guest_id: record.id,
            email: input.email,
            status: targetStatus,
          },
        },
      });

      return {
        id: record.id,
        event_id: eventId,
        guest_id: record.id,
        status: targetStatus,
        registered_at: record.createdAt.toISOString(),
        message,
      };
    });
  }

  /**
   * Cancel authenticated member registration and automatically promote earliest waitlisted attendee (INT-05).
   */
  async cancelRegistration(eventId: string, userId: string): Promise<{ message: string; promoted_waitlist_id?: string }> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock event
      const lockedRows = (await tx.$queryRaw`
        SELECT id, capacity FROM events WHERE id = ${eventId}::uuid FOR UPDATE;
      `) as LockedEventRow[];
      if (!lockedRows || lockedRows.length === 0) {
        throw new NotFoundException({ code: ErrorCode.EVENT_NOT_FOUND, message: 'Event not found.' });
      }

      const existing = await tx.registration.findUnique({
        where: {
          event_user_unique: {
            eventId,
            userId,
          },
        },
      });

      if (!existing || existing.status === RegistrationStatus.CANCELLED) {
        throw new BadRequestException({
          code: ErrorCode.NOT_FOUND,
          message: 'No active registration found for this event.',
        });
      }

      const wasRegistered = existing.status === RegistrationStatus.REGISTERED;

      // Update to cancelled
      await tx.registration.update({
        where: { id: existing.id },
        data: {
          status: RegistrationStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      let promotedId: string | undefined;

      // If they held a registered seat, promote the earliest waitlist member or guest
      if (wasRegistered) {
        const earliestWaitlistedMember = (await tx.$queryRaw`
          SELECT id, user_id FROM registrations
          WHERE event_id = ${eventId}::uuid AND status = 'waitlisted'
          ORDER BY registered_at ASC
          LIMIT 1
          FOR UPDATE;
        `) as WaitlistMemberRow[];

        if (earliestWaitlistedMember && earliestWaitlistedMember.length > 0) {
          const waitlistMember = earliestWaitlistedMember[0]!;
          await tx.registration.update({
            where: { id: waitlistMember.id },
            data: { status: RegistrationStatus.REGISTERED },
          });
          promotedId = waitlistMember.id;

          await tx.auditLog.create({
            data: {
              actorId: null,
              action: 'WAITLIST_PROMOTED_MEMBER',
              targetType: 'registration',
              targetId: waitlistMember.id,
              afterJson: { event_id: eventId, user_id: waitlistMember.user_id },
            },
          });
        } else {
          // Check for waitlisted guests
          const earliestWaitlistedGuest = (await tx.$queryRaw`
            SELECT id, email FROM event_guests
            WHERE event_id = ${eventId}::uuid AND status = 'waitlisted'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE;
          `) as WaitlistGuestRow[];

          if (earliestWaitlistedGuest && earliestWaitlistedGuest.length > 0) {
            const waitlistGuest = earliestWaitlistedGuest[0]!;
            await tx.eventGuest.update({
              where: { id: waitlistGuest.id },
              data: { status: RegistrationStatus.REGISTERED },
            });
            promotedId = waitlistGuest.id;

            await tx.auditLog.create({
              data: {
                actorId: null,
                action: 'WAITLIST_PROMOTED_GUEST',
                targetType: 'event_guest',
                targetId: waitlistGuest.id,
                afterJson: { event_id: eventId, email: waitlistGuest.email },
              },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'EVENT_REGISTRATION_CANCELLED',
          targetType: 'event',
          targetId: eventId,
          afterJson: { cancelled_registration_id: existing.id, promoted_id: promotedId },
        },
      });

      return {
        message: 'Registration successfully cancelled.',
        promoted_waitlist_id: promotedId,
      };
    });
  }

  /**
   * Generates single-event RFC 5545 ICS string.
   */
  async generateEventIcs(slugOrId: string): Promise<{ ics: string; slug: string; title: string }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
    const event = await this.prisma.event.findFirst({
      where: {
        OR: isUuid ? [{ id: slugOrId }, { slug: slugOrId }] : [{ slug: slugOrId }],
        state: { in: [EventState.PUBLISHED, EventState.REGISTRATION_OPEN, EventState.LIVE, EventState.COMPLETED, EventState.CERTIFIED] },
      },
      include: { venue: true },
    });

    if (!event) {
      throw new NotFoundException({
        code: ErrorCode.EVENT_NOT_FOUND,
        message: 'Event not found or not published.',
      });
    }

    const ics = this.buildIcsCalendar([event]);
    return { ics, slug: event.slug, title: event.title };
  }

  /**
   * Generates multi-event RFC 5545 calendar subscription feed.
   */
  async generateCalendarFeed(category?: string): Promise<string> {
    const where: Prisma.EventWhereInput = {
      state: { in: [EventState.PUBLISHED, EventState.REGISTRATION_OPEN, EventState.LIVE] },
    };
    if (category) {
      where.category = category;
    }

    const events = await this.prisma.event.findMany({
      where,
      include: { venue: true },
      orderBy: { startsAt: 'asc' },
      take: 100,
    });

    return this.buildIcsCalendar(events);
  }

  /**
   * Pure RFC 5545 VCALENDAR builder.
   */
  private buildIcsCalendar(events: CalendarEventItem[]): string {
    const formatIcsDate = (date: Date): string => {
      return date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    };

    const escapeIcs = (str: string): string => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\n|\r/g, '\\n');
    };

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CSI GCET Student Branch//Events Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:CSI GCET SB Events',
      'X-WR-TIMEZONE:Asia/Kolkata',
    ];

    for (const event of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${event.id}@csi.gcet.edu.in`);
      lines.push(`DTSTAMP:${formatIcsDate(new Date())}`);
      lines.push(`DTSTART:${formatIcsDate(new Date(event.startsAt))}`);
      lines.push(`DTEND:${formatIcsDate(new Date(event.endsAt))}`);
      lines.push(`SUMMARY:${escapeIcs(event.title)}`);
      lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
      if (event.venue?.name) {
        lines.push(`LOCATION:${escapeIcs(event.venue.name)}`);
      }
      lines.push(`STATUS:${event.state === EventState.CANCELLED ? 'CANCELLED' : 'CONFIRMED'}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
}
