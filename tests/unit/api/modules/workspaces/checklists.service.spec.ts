import { ChecklistsService } from '../../../../../apps/api/src/modules/workspaces/checklists.service.js';
import { WorkspacesService } from '../../../../../apps/api/src/modules/workspaces/workspaces.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { RoleCode, ChecklistRunStatus } from '@csi/shared';
import { ForbiddenException, ConflictException } from '@nestjs/common';

type MockPrisma = {
  checklist: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  checklistItem: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    aggregate: jest.Mock;
  };
  checklistRun: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  event: {
    findUnique: jest.Mock;
  };
  task: {
    findFirst: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
};

describe('ChecklistsService (Unit)', () => {
  let service: ChecklistsService;
  let mockPrisma: MockPrisma;
  let mockWorkspacesService: {
    validateCommitteeAccess: jest.Mock;
  };

  const mockCommittee = {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'logistics',
    name: 'Logistics & Operations',
    description: 'Venue and equipment operations',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      checklist: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      checklistItem: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 0 } }),
      },
      checklistRun: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      task: {
        findFirst: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-chk-1' }),
      },
    };

    mockWorkspacesService = {
      validateCommitteeAccess: jest.fn().mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.COMMITTEE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      }),
    };

    service = new ChecklistsService(
      mockPrisma as unknown as PrismaService,
      mockWorkspacesService as unknown as WorkspacesService,
    );
  });

  describe('createChecklist', () => {
    it('should create checklist with items and log audit event', async () => {
      const createdRecord = {
        id: 'chk-1',
        committeeId: mockCommittee.id,
        committee: mockCommittee,
        eventId: null,
        event: null,
        taskId: null,
        title: 'Auditorium Launch Checklist',
        description: null,
        isTemplate: true,
        createdById: 'user-creator',
        createdBy: { id: 'user-creator', name: 'Logistics Head', email: 'logistics@gcet.edu.in' },
        items: [
          {
            id: 'item-1',
            checklistId: 'chk-1',
            title: 'Verify audio mixer',
            description: null,
            isCompleted: false,
            completedAt: null,
            completedById: null,
            completedBy: null,
            assignedToId: null,
            assignedTo: null,
            orderIndex: 0,
            createdAt: new Date('2026-11-01T00:00:00Z'),
            updatedAt: new Date('2026-11-01T00:00:00Z'),
          },
        ],
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T00:00:00Z'),
      };

      mockPrisma.checklist.create.mockResolvedValue(createdRecord);

      const result = await service.createChecklist(
        'user-creator',
        [RoleCode.COMMITTEE],
        'logistics',
        {
          title: 'Auditorium Launch Checklist',
          isTemplate: true,
          items: [{ title: 'Verify audio mixer' }],
        },
      );

      expect(result.id).toBe('chk-1');
      expect(result.items).toHaveLength(1);
      expect(result.totalItems).toBe(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'checklist.created',
          }),
        }),
      );
    });
  });

  describe('updateChecklistItem', () => {
    it('should mark item completed with timestamp and user id', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue({ id: 'chk-1', committeeId: mockCommittee.id });
      mockPrisma.checklistItem.findFirst.mockResolvedValue({
        id: 'item-1',
        checklistId: 'chk-1',
        title: 'Check mic battery',
        isCompleted: false,
        completedAt: null,
        completedById: null,
        assignedToId: null,
        orderIndex: 0,
      });

      mockPrisma.checklistItem.update.mockResolvedValue({
        id: 'item-1',
        checklistId: 'chk-1',
        title: 'Check mic battery',
        description: null,
        isCompleted: true,
        completedAt: new Date('2026-11-01T12:00:00Z'),
        completedById: 'user-volunteer',
        completedBy: { id: 'user-volunteer', name: 'Volunteer', email: 'vol@gcet.edu.in' },
        assignedToId: null,
        assignedTo: null,
        orderIndex: 0,
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T12:00:00Z'),
      });

      const result = await service.updateChecklistItem(
        'user-volunteer',
        [RoleCode.COMMITTEE],
        'logistics',
        'chk-1',
        'item-1',
        { isCompleted: true },
      );

      expect(result.isCompleted).toBe(true);
      expect(result.completedById).toBe('user-volunteer');
    });
  });

  describe('signOffChecklistRun', () => {
    it('should throw ForbiddenException if regular volunteer attempts to sign off', async () => {
      mockWorkspacesService.validateCommitteeAccess.mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.COMMITTEE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      });

      await expect(
        service.signOffChecklistRun(
          'user-volunteer',
          [RoleCode.COMMITTEE],
          'logistics',
          'run-1',
          { signOffNotes: 'Done' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if run is already signed off', async () => {
      mockWorkspacesService.validateCommitteeAccess.mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.CORE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      });

      mockPrisma.checklistRun.findFirst.mockResolvedValue({
        id: 'run-1',
        committeeId: mockCommittee.id,
        status: ChecklistRunStatus.SIGNED_OFF,
        signedOffAt: new Date('2026-11-01T10:00:00Z'),
        checklist: { items: [] },
      });

      await expect(
        service.signOffChecklistRun(
          'user-lead',
          [RoleCode.CORE],
          'logistics',
          'run-1',
          { signOffNotes: 'Duplicate attempt' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should sign off successfully when user is CORE head', async () => {
      mockWorkspacesService.validateCommitteeAccess.mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.CORE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      });

      mockPrisma.checklistRun.findFirst.mockResolvedValue({
        id: 'run-1',
        committeeId: mockCommittee.id,
        checklistId: 'chk-1',
        status: ChecklistRunStatus.IN_PROGRESS,
        checklist: {
          title: 'Auditorium Protocol',
          items: [],
        },
      });

      mockPrisma.checklistRun.update.mockResolvedValue({
        id: 'run-1',
        checklistId: 'chk-1',
        checklist: { title: 'Auditorium Protocol' },
        committeeId: mockCommittee.id,
        committee: mockCommittee,
        eventId: null,
        event: null,
        status: ChecklistRunStatus.SIGNED_OFF,
        signedOffById: 'user-lead',
        signedOffBy: { id: 'user-lead', name: 'Lead User', email: 'lead@gcet.edu.in' },
        signedOffAt: new Date('2026-11-01T12:00:00Z'),
        signOffNotes: 'Stage is ready',
        createdById: 'user-lead',
        createdBy: { id: 'user-lead', name: 'Lead User', email: 'lead@gcet.edu.in' },
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T12:00:00Z'),
      });

      const result = await service.signOffChecklistRun(
        'user-lead',
        [RoleCode.CORE],
        'logistics',
        'run-1',
        { signOffNotes: 'Stage is ready' },
      );

      expect(result.status).toBe(ChecklistRunStatus.SIGNED_OFF);
      expect(result.signedOffById).toBe('user-lead');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'checklist_run.signed_off',
          }),
        }),
      );
    });
  });
});
