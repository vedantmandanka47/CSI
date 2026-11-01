import { WorkspacesService } from '../../../../../apps/api/src/modules/workspaces/workspaces.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { RoleCode, ErrorCode } from '@csi/shared';
import { NotFoundException } from '@nestjs/common';

type MockPrisma = {
  committee: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  roleAssignment: {
    findMany: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  event: {
    findMany: jest.Mock;
  };
  attendanceSession: {
    findMany: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
};

describe('WorkspacesService (Unit)', () => {
  let service: WorkspacesService;
  let mockPrisma: MockPrisma;

  const mockTechnicalCommittee = {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'technical',
    name: 'Technical Committee',
    description: 'Technical infrastructure and workshops',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  const mockLogisticsCommittee = {
    id: '22222222-2222-2222-2222-222222222222',
    code: 'logistics',
    name: 'Logistics & Operations',
    description: 'Venue and equipment operations',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      committee: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      roleAssignment: {
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
      },
      attendanceSession: {
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    service = new WorkspacesService(mockPrisma as unknown as PrismaService);
  });

  describe('getMyWorkspaces', () => {
    it('should return empty list when user has no committee assignments and is not executive', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([]);

      const result = await service.getMyWorkspaces('user-1', [RoleCode.MEMBER]);

      expect(result.isExecutive).toBe(false);
      expect(result.workspaces).toHaveLength(0);
      expect(result.primaryWorkspace).toBeNull();
    });

    it('should return active committee workspace for a single assigned committee', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        {
          id: 'ra-1',
          committeeId: mockTechnicalCommittee.id,
          termStart: new Date('2026-08-01T00:00:00Z'),
          termEnd: null,
          committee: mockTechnicalCommittee,
          role: { code: RoleCode.CORE },
        },
      ]);

      const result = await service.getMyWorkspaces('user-1', [RoleCode.CORE]);

      expect(result.isExecutive).toBe(false);
      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0]?.code).toBe('technical');
      expect(result.workspaces[0]?.userRole).toBe(RoleCode.CORE);
      expect(result.workspaces[0]?.userRoleName).toBe('Core Committee Head');
      expect(result.primaryWorkspace?.code).toBe('technical');
    });

    it('should support dual-role members assigned to multiple committees', async () => {
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        {
          id: 'ra-1',
          committeeId: mockTechnicalCommittee.id,
          termStart: new Date('2026-08-01T00:00:00Z'),
          termEnd: null,
          committee: mockTechnicalCommittee,
          role: { code: RoleCode.CORE },
        },
        {
          id: 'ra-2',
          committeeId: mockLogisticsCommittee.id,
          termStart: new Date('2026-08-01T00:00:00Z'),
          termEnd: null,
          committee: mockLogisticsCommittee,
          role: { code: RoleCode.COMMITTEE },
        },
      ]);

      const result = await service.getMyWorkspaces('user-1', [RoleCode.CORE, RoleCode.COMMITTEE]);

      expect(result.isExecutive).toBe(false);
      expect(result.workspaces).toHaveLength(2);
      expect(result.workspaces.map((w) => w.code)).toEqual(['technical', 'logistics']);
      expect(result.primaryWorkspace?.code).toBe('technical');
    });

    it('should grant executive users branch-wide oversight across all committees', async () => {
      mockPrisma.committee.findMany.mockResolvedValue([
        mockTechnicalCommittee,
        mockLogisticsCommittee,
      ]);

      const result = await service.getMyWorkspaces('pres-1', [RoleCode.PRESIDENT]);

      expect(result.isExecutive).toBe(true);
      expect(result.workspaces).toHaveLength(2);
      expect(result.workspaces[0]?.isExecutiveOversight).toBe(true);
      expect(result.workspaces[0]?.userRole).toBe(RoleCode.PRESIDENT);
      expect(result.primaryWorkspace?.code).toBe('technical');
    });
  });

  describe('getWorkspaceDetails', () => {
    it('should throw NotFoundException if committee code does not exist', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(null);

      await expect(
        service.getWorkspaceDetails('user-1', [RoleCode.MEMBER], 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user has no role in the requested committee', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(mockTechnicalCommittee);
      mockPrisma.roleAssignment.findMany.mockResolvedValue([]);

      await expect(
        service.getWorkspaceDetails('user-1', [RoleCode.MEMBER], 'technical'),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.WORKSPACE_ACCESS_DENIED,
        },
      });
    });

    it('should throw ForbiddenException if user tenure has expired', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(mockTechnicalCommittee);
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        {
          id: 'ra-expired',
          termStart: new Date('2025-08-01T00:00:00Z'),
          termEnd: new Date('2026-05-31T00:00:00Z'), // past
          role: { code: RoleCode.COMMITTEE },
        },
      ]);

      await expect(
        service.getWorkspaceDetails('user-1', [RoleCode.COMMITTEE], 'technical'),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.COMMITTEE_TENURE_EXPIRED },
      });
    });

    it('should throw ForbiddenException if user tenure has not started yet', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(mockTechnicalCommittee);
      const futureStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        {
          id: 'ra-future',
          termStart: futureStart,
          termEnd: null,
          role: { code: RoleCode.CORE },
        },
      ]);

      await expect(
        service.getWorkspaceDetails('user-1', [RoleCode.CORE], 'technical'),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.COMMITTEE_TENURE_NOT_STARTED },
      });
    });

    it('should throw ForbiddenException if user account is deactivated', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(mockTechnicalCommittee);
      mockPrisma.roleAssignment.findMany.mockResolvedValue([
        {
          id: 'ra-active',
          termStart: new Date('2026-08-01T00:00:00Z'),
          termEnd: null,
          role: { code: RoleCode.COMMITTEE },
        },
      ]);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'inactive',
      });

      await expect(
        service.getWorkspaceDetails('user-1', [RoleCode.COMMITTEE], 'technical'),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.ACCOUNT_DEACTIVATED },
      });
    });

    it('should grant access and return complete workspace details for an authorized committee member', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(mockTechnicalCommittee);
      mockPrisma.roleAssignment.findMany
        .mockResolvedValueOnce([
          {
            id: 'ra-active',
            termStart: new Date('2026-08-01T00:00:00Z'),
            termEnd: null,
            role: { code: RoleCode.CORE, name: 'Core Committee Head' },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'ra-1',
            userId: 'user-1',
            termStart: new Date('2026-08-01T00:00:00Z'),
            termEnd: null,
            user: {
              id: 'user-1',
              name: 'Vedant Mandanka',
              email: 'vedant@gcet.edu.in',
              branch: 'Computer',
              year: 3,
              photo: null,
              status: 'active',
            },
            role: { code: RoleCode.CORE, name: 'Core Committee Head' },
          },
          {
            id: 'ra-2',
            userId: 'user-2',
            termStart: new Date('2026-08-01T00:00:00Z'),
            termEnd: null,
            user: {
              id: 'user-2',
              name: 'Aarav Patel',
              email: 'aarav@gcet.edu.in',
              branch: 'IT',
              year: 2,
              photo: null,
              status: 'active',
            },
            role: { code: RoleCode.COMMITTEE, name: 'Committee Member' },
          },
        ]);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        status: 'active',
      });

      mockPrisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          slug: 'hackathon-2026',
          title: 'GCET Hackathon 2026',
          category: 'hackathon',
          startsAt: new Date('2026-11-20T09:00:00Z'),
          endsAt: new Date('2026-11-21T18:00:00Z'),
          state: 'published',
          venue: { name: 'Main Auditorium' },
        },
      ]);

      mockPrisma.attendanceSession.findMany.mockResolvedValue([
        {
          id: 'session-1',
          eventId: 'event-1',
          name: 'Day 1 Check-in',
          isOpen: true,
          createdAt: new Date('2026-11-20T08:30:00Z'),
          event: { title: 'GCET Hackathon 2026' },
        },
      ]);

      const result = await service.getWorkspaceDetails(
        'user-1',
        [RoleCode.CORE],
        'technical',
        '127.0.0.1',
      );

      expect(result.committee.code).toBe('technical');
      expect(result.currentUserAccess.roleCode).toBe(RoleCode.CORE);
      expect(result.currentUserAccess.isExecutive).toBe(false);
      expect(result.currentUserAccess.capabilities.canManageAttendance).toBe(true);
      expect(result.metrics.totalMembers).toBe(2);
      expect(result.metrics.coreHeads).toBe(1);
      expect(result.metrics.committeeVolunteers).toBe(1);
      expect(result.members).toHaveLength(2);
      expect(result.recentEvents).toHaveLength(1);
      expect(result.activeSessions).toHaveLength(1);

      // Verify audit log call
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'workspace.accessed',
          targetType: 'committee',
          targetId: mockTechnicalCommittee.id,
          actorId: 'user-1',
          afterJson: {
            committeeCode: 'technical',
            role: RoleCode.CORE,
            isExecutive: false,
          },
          ip: '127.0.0.1',
        },
      });
    });

    it('should grant executive oversight access to any committee without direct assignment', async () => {
      mockPrisma.committee.findUnique.mockResolvedValue(mockTechnicalCommittee);
      mockPrisma.roleAssignment.findMany.mockResolvedValue([]);
      mockPrisma.event.findMany.mockResolvedValue([]);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);

      const result = await service.getWorkspaceDetails(
        'pres-1',
        [RoleCode.PRESIDENT],
        'technical',
      );

      expect(result.currentUserAccess.isExecutive).toBe(true);
      expect(result.currentUserAccess.roleCode).toBe(RoleCode.PRESIDENT);
      expect(result.currentUserAccess.capabilities.canManageRoster).toBe(true);
      expect(result.currentUserAccess.capabilities.canExportData).toBe(true);
    });
  });
});
