import { TasksService } from '../../../../../apps/api/src/modules/workspaces/tasks.service.js';
import { WorkspacesService } from '../../../../../apps/api/src/modules/workspaces/workspaces.service.js';
import { PrismaService } from '../../../../../apps/api/src/infra/prisma/prisma.service.js';
import { RoleCode, ErrorCode, TaskStatus, TaskPriority } from '@csi/shared';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

type MockPrisma = {
  task: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  event: {
    findUnique: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
};

describe('TasksService (Unit)', () => {
  let service: TasksService;
  let mockPrisma: MockPrisma;
  let mockWorkspacesService: {
    validateCommitteeAccess: jest.Mock;
  };

  const mockCommittee = {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'technical',
    name: 'Technical Committee',
    description: 'Technical infrastructure',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      event: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-task-1' }),
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

    service = new TasksService(
      mockPrisma as unknown as PrismaService,
      mockWorkspacesService as unknown as WorkspacesService,
    );
  });

  describe('createTask', () => {
    it('should create a task and log audit event', async () => {
      const createdRecord = {
        id: 'task-1',
        committeeId: mockCommittee.id,
        committee: mockCommittee,
        eventId: null,
        event: null,
        title: 'Deploy test infrastructure',
        description: 'Set up staging databases',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2026-11-20T00:00:00Z'),
        assignedToId: null,
        assignedTo: null,
        createdById: 'user-creator',
        createdBy: { id: 'user-creator', name: 'Dev User', email: 'dev@gcet.edu.in' },
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T00:00:00Z'),
      };

      mockPrisma.task.create.mockResolvedValue(createdRecord);

      const result = await service.createTask(
        'user-creator',
        [RoleCode.COMMITTEE],
        'technical',
        {
          title: 'Deploy test infrastructure',
          description: 'Set up staging databases',
          status: TaskStatus.TODO,
          priority: TaskPriority.HIGH,
          dueDate: '2026-11-20T00:00:00.000Z',
        },
      );

      expect(result.id).toBe('task-1');
      expect(result.title).toBe('Deploy test infrastructure');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'task.created',
            targetId: 'task-1',
          }),
        }),
      );
    });

    it('should throw BadRequestException if assigned user is not in committee', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'outsider-1',
        status: 'active',
        roleAssignments: [
          {
            committeeId: 'different-committee-id',
            termStart: new Date('2026-08-01T00:00:00Z'),
            termEnd: null,
            role: { code: RoleCode.COMMITTEE },
          },
        ],
      });

      await expect(
        service.createTask('user-creator', [RoleCode.COMMITTEE], 'technical', {
          title: 'Some task',
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          assignedToId: 'outsider-1',
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.TASK_ASSIGNMENT_INVALID,
        },
      });
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.createTask('user-creator', [RoleCode.COMMITTEE], 'technical', {
          title: 'Some task',
          status: TaskStatus.TODO,
          priority: TaskPriority.MEDIUM,
          eventId: '99999999-9999-9999-9999-999999999999',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTask', () => {
    it('should update task status and log audit record', async () => {
      const existing = {
        id: 'task-1',
        committeeId: mockCommittee.id,
        title: 'Original Title',
        description: null,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: null,
        assignedToId: null,
        createdById: 'user-creator',
      };

      const updated = {
        ...existing,
        status: TaskStatus.COMPLETED,
        committee: mockCommittee,
        event: null,
        assignedTo: null,
        createdBy: { id: 'user-creator', name: 'Dev User', email: 'dev@gcet.edu.in' },
        createdAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-01T01:00:00Z'),
      };

      mockPrisma.task.findFirst.mockResolvedValue(existing);
      mockPrisma.task.update.mockResolvedValue(updated);

      const result = await service.updateTask(
        'user-creator',
        [RoleCode.COMMITTEE],
        'technical',
        'task-1',
        { status: TaskStatus.COMPLETED },
      );

      expect(result.status).toBe(TaskStatus.COMPLETED);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'task.updated',
          }),
        }),
      );
    });
  });

  describe('deleteTask', () => {
    it('should throw ForbiddenException if user is not creator, lead or executive', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        committeeId: mockCommittee.id,
        createdById: 'other-user',
        title: 'Task to delete',
      });

      await expect(
        service.deleteTask('unauthorized-user', [RoleCode.COMMITTEE], 'technical', 'task-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should delete task when user is committee lead', async () => {
      mockWorkspacesService.validateCommitteeAccess.mockResolvedValue({
        committee: mockCommittee,
        isExecutive: false,
        activeRoleCode: RoleCode.CORE,
        activeTermStart: '2026-08-01T00:00:00.000Z',
        activeTermEnd: null,
      });

      mockPrisma.task.findFirst.mockResolvedValue({
        id: 'task-1',
        committeeId: mockCommittee.id,
        createdById: 'volunteer-1',
        title: 'Task to delete',
      });
      mockPrisma.task.delete.mockResolvedValue({ id: 'task-1' });

      const result = await service.deleteTask('lead-user', [RoleCode.CORE], 'technical', 'task-1');
      expect(result.success).toBe(true);
      expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    });
  });
});
