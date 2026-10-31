import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VenuesService } from '../../../../../apps/api/src/modules/venues/venues.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { AvCapability, VenueDetail } from '@csi/shared';

describe('VenuesService (M10)', () => {
  let service: VenuesService;

  const mockPrisma = {
    venue: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    event: {
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VenuesService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<VenuesService>(VenuesService);
  });

  describe('listVenues', () => {
    it('filters active venues and returns public fields for non-admin requests', async () => {
      mockPrisma.venue.findMany.mockResolvedValue([
        {
          id: 'v-1',
          name: 'Auditorium 1',
          description: 'Main campus auditorium',
          building: 'Main Block',
          roomNumber: 'AUD-01',
          capacity: 300,
          mapUrl: 'https://maps.example.com/aud1',
          contact: 'Dr. Patel (9876543210)',
          notes: 'Key in admin office',
          avCapabilities: [AvCapability.PROJECTOR, AvCapability.AUDIO_SYSTEM],
          isAvailable: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.listVenues({}, false);

      expect(mockPrisma.venue.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ building: 'asc' }, { name: 'asc' }],
      });
      expect(result).toHaveLength(1);
      // Non-admin public view must NOT expose contact or notes
      const publicVenue = result[0] as unknown as Record<string, unknown>;
      expect(publicVenue.contact).toBeUndefined();
      expect(publicVenue.notes).toBeUndefined();
      expect(publicVenue.name).toBe('Auditorium 1');
    });

    it('returns full detail including contact and notes for admin requests', async () => {
      mockPrisma.venue.findMany.mockResolvedValue([
        {
          id: 'v-1',
          name: 'Auditorium 1',
          description: 'Main campus auditorium',
          building: 'Main Block',
          roomNumber: 'AUD-01',
          capacity: 300,
          mapUrl: null,
          contact: 'Dr. Patel',
          notes: 'Key in admin office',
          avCapabilities: [AvCapability.PROJECTOR],
          isAvailable: true,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.listVenues({ is_active: 'true' }, true);

      expect(result).toHaveLength(1);
      const adminVenue = result[0] as VenueDetail;
      expect(adminVenue.contact).toBe('Dr. Patel');
      expect(adminVenue.notes).toBe('Key in admin office');
    });
  });

  describe('getVenueById', () => {
    it('throws NotFoundException when venue does not exist', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue(null);

      await expect(service.getVenueById('nonexistent-id', false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for inactive venue when accessed by non-admin', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-inactive',
        name: 'Old Lab',
        isActive: false,
      });

      await expect(service.getVenueById('v-inactive', false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows admin to retrieve inactive venue', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-inactive',
        name: 'Old Lab',
        building: 'Old Block',
        roomNumber: '101',
        capacity: 25,
        mapUrl: null,
        contact: null,
        notes: null,
        avCapabilities: [],
        isAvailable: false,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = (await service.getVenueById('v-inactive', true)) as VenueDetail;
      expect(res.name).toBe('Old Lab');
      expect(res.is_active).toBe(false);
    });
  });

  describe('createVenue', () => {
    it('validates positive capacity and writes audit log upon creation', async () => {
      mockPrisma.venue.create.mockResolvedValue({
        id: 'v-new',
        name: 'Seminar Hall 3',
        description: null,
        building: 'Mechanical Block',
        roomNumber: 'SH-03',
        capacity: 120,
        mapUrl: null,
        contact: null,
        notes: null,
        avCapabilities: [AvCapability.PROJECTOR],
        isAvailable: true,
        isActive: true,
        createdAt: new Date('2026-10-30T10:00:00Z'),
        updatedAt: new Date('2026-10-30T10:00:00Z'),
      });

      const res = await service.createVenue(
        {
          name: 'Seminar Hall 3',
          building: 'Mechanical Block',
          room_number: 'SH-03',
          capacity: 120,
          av_capabilities: [AvCapability.PROJECTOR],
        },
        'admin-user-id',
      );

      expect(res.id).toBe('v-new');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'VENUE_CREATED',
            targetType: 'venue',
            targetId: 'v-new',
          }),
        }),
      );
    });

    it('rejects venue with non-positive capacity', async () => {
      await expect(
        service.createVenue(
          {
            name: 'Bad Venue',
            building: 'Block A',
            capacity: 0,
          },
          'admin-user-id',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateVenue', () => {
    it('updates venue details and writes audit log', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-1',
        name: 'Auditorium',
        capacity: 200,
        isAvailable: true,
        isActive: true,
      });

      mockPrisma.venue.update.mockResolvedValue({
        id: 'v-1',
        name: 'Auditorium Renamed',
        description: null,
        building: 'Main Block',
        roomNumber: null,
        capacity: 220,
        mapUrl: null,
        contact: null,
        notes: null,
        avCapabilities: [],
        isAvailable: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.updateVenue(
        'v-1',
        { name: 'Auditorium Renamed', capacity: 220 },
        'admin-user-id',
      );

      expect(res.name).toBe('Auditorium Renamed');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'VENUE_UPDATED',
            targetType: 'venue',
            targetId: 'v-1',
          }),
        }),
      );
    });

    it('rejects updating venue with non-positive capacity', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-1',
        name: 'Auditorium',
        capacity: 200,
        isAvailable: true,
        isActive: true,
      });

      await expect(
        service.updateVenue('v-1', { capacity: -10 }, 'admin-user-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkConflict', () => {
    it('returns available: false if venue is inactive', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-1',
        name: 'Inactive Hall',
        isActive: false,
        isAvailable: true,
      });

      const res = await service.checkConflict(
        'v-1',
        new Date('2026-11-10T10:00:00Z'),
        new Date('2026-11-10T12:00:00Z'),
      );

      expect(res.available).toBe(false);
      expect(res.message).toMatch(/marked inactive/i);
    });

    it('returns available: false with conflict details when an overlapping event exists', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-1',
        name: 'Auditorium A',
        isActive: true,
        isAvailable: true,
      });

      mockPrisma.event.findFirst.mockResolvedValue({
        id: 'evt-conflict',
        title: 'Python Bootcamp',
        startsAt: new Date('2026-11-10T11:00:00Z'),
        endsAt: new Date('2026-11-10T13:00:00Z'),
      });

      const res = await service.checkConflict(
        'v-1',
        new Date('2026-11-10T10:00:00Z'),
        new Date('2026-11-10T12:00:00Z'),
      );

      expect(res.available).toBe(false);
      expect(res.conflicting_event).toBeDefined();
      expect(res.conflicting_event?.title).toBe('Python Bootcamp');
      expect(res.message).toMatch(/Python Bootcamp/);
    });

    it('returns available: true when no overlapping event is scheduled', async () => {
      mockPrisma.venue.findUnique.mockResolvedValue({
        id: 'v-1',
        name: 'Auditorium A',
        isActive: true,
        isAvailable: true,
      });

      mockPrisma.event.findFirst.mockResolvedValue(null);

      const res = await service.checkConflict(
        'v-1',
        new Date('2026-11-10T10:00:00Z'),
        new Date('2026-11-10T12:00:00Z'),
      );

      expect(res.available).toBe(true);
      expect(res.conflicting_event).toBeUndefined();
      expect(res.message).toMatch(/available/i);
    });
  });
});

