import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  CreateVenueInput,
  CreateVenueRawInput,
  UpdateVenueInput,
  VenueQuery,
  VenueDetail,
  PublicVenueSummary,
  ConflictCheckResponse,
  EventState,
  ErrorCode,
} from '@csi/shared';

@Injectable()
export class VenuesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List venues with optional filters.
   * If non-admin, only active venues are returned with public fields.
   */
  async listVenues(query: VenueQuery, isAdmin: boolean): Promise<PublicVenueSummary[] | VenueDetail[]> {
    const where: Prisma.VenueWhereInput = {};

    if (!isAdmin) {
      where.isActive = true;
    } else if (query.is_active !== undefined) {
      where.isActive = query.is_active === 'true';
    }

    if (query.is_available !== undefined) {
      where.isAvailable = query.is_available === 'true';
    }

    if (query.building) {
      where.building = { contains: query.building, mode: 'insensitive' };
    }

    if (query.min_capacity) {
      where.capacity = { gte: query.min_capacity };
    }

    if (query.av_capability) {
      where.avCapabilities = { has: query.av_capability };
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { building: { contains: query.search, mode: 'insensitive' } },
        { roomNumber: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const venues = await this.prisma.venue.findMany({
      where,
      orderBy: [{ building: 'asc' }, { name: 'asc' }],
    });

    if (!isAdmin) {
      return venues.map((v) => this.mapToPublic(v));
    }

    return venues.map((v) => this.mapToDetail(v));
  }

  /**
   * Retrieve a venue by ID.
   */
  async getVenueById(id: string, isAdmin: boolean): Promise<PublicVenueSummary | VenueDetail> {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
    });

    if (!venue) {
      throw new NotFoundException({
        code: ErrorCode.VENUE_NOT_FOUND,
        message: 'Venue not found.',
      });
    }

    if (!isAdmin && !venue.isActive) {
      throw new NotFoundException({
        code: ErrorCode.VENUE_NOT_FOUND,
        message: 'Venue not found or inactive.',
      });
    }

    return isAdmin ? this.mapToDetail(venue) : this.mapToPublic(venue);
  }

  /**
   * Create a new campus venue record (Admin/Core).
   */
  async createVenue(input: CreateVenueInput | CreateVenueRawInput, actorId: string): Promise<VenueDetail> {
    if (input.capacity <= 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Venue capacity must be a positive integer.',
      });
    }

    const venue = await this.prisma.venue.create({
      data: {
        name: input.name,
        description: input.description || null,
        building: input.building,
        roomNumber: input.room_number || null,
        capacity: input.capacity,
        mapUrl: input.map_url || null,
        contact: input.contact || null,
        notes: input.notes || null,
        avCapabilities: input.av_capabilities || [],
        isAvailable: input.is_available ?? true,
        isActive: input.is_active ?? true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'VENUE_CREATED',
        targetType: 'venue',
        targetId: venue.id,
        afterJson: {
          name: venue.name,
          building: venue.building,
          room_number: venue.roomNumber,
          capacity: venue.capacity,
          av_capabilities: venue.avCapabilities,
          is_available: venue.isAvailable,
          is_active: venue.isActive,
        },
      },
    });

    return this.mapToDetail(venue);
  }

  /**
   * Update an existing venue record.
   */
  async updateVenue(id: string, input: UpdateVenueInput, actorId: string): Promise<VenueDetail> {
    const existing = await this.prisma.venue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.VENUE_NOT_FOUND,
        message: 'Venue not found.',
      });
    }

    if (input.capacity !== undefined && input.capacity <= 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Venue capacity must be a positive integer.',
      });
    }

    const updated = await this.prisma.venue.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        building: input.building,
        roomNumber: input.room_number,
        capacity: input.capacity,
        mapUrl: input.map_url,
        contact: input.contact,
        notes: input.notes,
        avCapabilities: input.av_capabilities,
        isAvailable: input.is_available,
        isActive: input.is_active,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'VENUE_UPDATED',
        targetType: 'venue',
        targetId: id,
        beforeJson: {
          name: existing.name,
          capacity: existing.capacity,
          is_available: existing.isAvailable,
          is_active: existing.isActive,
        },
        afterJson: {
          name: updated.name,
          capacity: updated.capacity,
          is_available: updated.isAvailable,
          is_active: updated.isActive,
        },
      },
    });

    return this.mapToDetail(updated);
  }

  /**
   * Conflict Detection Engine: Check if a venue is available for a proposed time window.
   */
  async checkConflict(
    venueId: string,
    startsAt: Date,
    endsAt: Date,
    excludeEventId?: string,
  ): Promise<ConflictCheckResponse> {
    const venue = await this.prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException({
        code: ErrorCode.VENUE_NOT_FOUND,
        message: 'Specified venue does not exist.',
      });
    }

    if (!venue.isActive) {
      return {
        available: false,
        message: `Venue "${venue.name}" is marked inactive and cannot be scheduled.`,
      };
    }

    if (!venue.isAvailable) {
      return {
        available: false,
        message: `Venue "${venue.name}" is currently marked unavailable (e.g. maintenance).`,
      };
    }

    const overlapping = await this.prisma.event.findFirst({
      where: {
        venueId,
        id: excludeEventId ? { not: excludeEventId } : undefined,
        state: { not: EventState.CANCELLED },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (overlapping) {
      return {
        available: false,
        conflicting_event: {
          id: overlapping.id,
          title: overlapping.title,
          starts_at: overlapping.startsAt.toISOString(),
          ends_at: overlapping.endsAt.toISOString(),
        },
        message: `Schedule conflict: Venue is already booked for "${overlapping.title}" (${overlapping.startsAt.toISOString()} to ${overlapping.endsAt.toISOString()}).`,
      };
    }

    return {
      available: true,
      message: `Venue "${venue.name}" is available for the requested time window.`,
    };
  }

  private mapToPublic(v: {
    id: string;
    name: string;
    description: string | null;
    building: string;
    roomNumber: string | null;
    capacity: number;
    mapUrl: string | null;
    avCapabilities: string[];
    isAvailable: boolean;
  }): PublicVenueSummary {
    return {
      id: v.id,
      name: v.name,
      description: v.description,
      building: v.building,
      room_number: v.roomNumber,
      capacity: v.capacity,
      map_url: v.mapUrl,
      av_capabilities: v.avCapabilities,
      is_available: v.isAvailable,
    };
  }

  private mapToDetail(v: {
    id: string;
    name: string;
    description: string | null;
    building: string;
    roomNumber: string | null;
    capacity: number;
    mapUrl: string | null;
    contact: string | null;
    notes: string | null;
    avCapabilities: string[];
    isAvailable: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): VenueDetail {
    return {
      id: v.id,
      name: v.name,
      description: v.description,
      building: v.building,
      room_number: v.roomNumber,
      capacity: v.capacity,
      map_url: v.mapUrl,
      contact: v.contact,
      notes: v.notes,
      av_capabilities: v.avCapabilities,
      is_available: v.isAvailable,
      is_active: v.isActive,
      created_at: v.createdAt.toISOString(),
      updated_at: v.updatedAt.toISOString(),
    };
  }
}
