import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from '../../../../../apps/api/src/modules/dashboard/dashboard.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { UserStatus } from '@csi/shared';

describe('DashboardService (M9)', () => {
  let service: DashboardService;
  let mockPrisma: {
    user: { findUnique: jest.Mock };
    registration: { findMany: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      registration: {
        findMany: jest.fn(),
      },
      attendanceRecord: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getMemberDashboard', () => {
    it('returns member dashboard with profile, statistics, upcoming events, and activity', async () => {
      const mockUser = {
        id: 'member-1',
        name: 'Jane Doe',
        email: 'jane@gcet.edu.in',
        enrollmentNo: '23CS101',
        branch: 'CSE',
        year: 2,
        status: UserStatus.ACTIVE,
        createdAt: new Date('2026-08-01T10:00:00Z'),
        roleAssignments: [{ role: { code: 'member' } }],
      };

      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000 * 5);
      const pastDate = new Date(now.getTime() - 86400000 * 5);

      const mockRegistrations = [
        {
          id: 'reg-1',
          eventId: 'evt-upcoming',
          userId: 'member-1',
          status: 'registered',
          registeredAt: new Date('2026-10-01T10:00:00Z'),
          event: {
            id: 'evt-upcoming',
            slug: 'future-hackathon',
            title: 'Future Hackathon',
            category: 'hackathon',
            startsAt: futureDate,
            endsAt: new Date(futureDate.getTime() + 3600000 * 8),
            venue: { name: 'Main Auditorium' },
          },
        },
        {
          id: 'reg-2',
          eventId: 'evt-past',
          userId: 'member-1',
          status: 'registered',
          registeredAt: new Date('2026-09-01T10:00:00Z'),
          event: {
            id: 'evt-past',
            slug: 'past-workshop',
            title: 'Past Web Workshop',
            category: 'workshop',
            startsAt: pastDate,
            endsAt: new Date(pastDate.getTime() + 3600000 * 4),
            venue: { name: 'Lab 3' },
          },
        },
      ];

      const mockAttendance = [
        {
          id: 'att-1',
          eventId: 'evt-past',
          method: 'qr_scan',
          status: 'verified',
          verifiedAt: new Date('2026-09-05T10:30:00Z'),
          event: { title: 'Past Web Workshop' },
          session: { name: 'Morning Lab Session' },
        },
      ];

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.registration.findMany.mockResolvedValue(mockRegistrations);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue(mockAttendance);

      const dashboard = await service.getMemberDashboard('member-1');

      expect(dashboard.profile.id).toBe('member-1');
      expect(dashboard.profile.name).toBe('Jane Doe');
      expect(dashboard.statistics.total_registered_events).toBe(2);
      expect(dashboard.statistics.attended_events_count).toBe(1);
      expect(dashboard.statistics.attendance_percentage).toBe(50); // 1 out of 2 = 50%
      expect(dashboard.upcoming_events).toHaveLength(1);
      expect(dashboard.upcoming_events[0]?.title).toBe('Future Hackathon');
      expect(dashboard.past_registrations).toHaveLength(1);
      expect(dashboard.past_registrations[0]?.attendance_status).toBe('attended');
      expect(dashboard.recent_activity.length).toBeGreaterThanOrEqual(3);
    });

    it('throws NotFoundException if user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMemberDashboard('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
