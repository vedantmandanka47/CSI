import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { WorkspacesService } from './workspaces.service.js';
import {
  RoleCode,
  ErrorCode,
  CreateTaskInput,
  UpdateTaskInput,
  TaskResponse,
  TaskListResponse,
} from '@csi/shared';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Validate that the assigned user is an active member of this committee or an executive
   */
  private async validateAssignee(committeeId: string, assignedToId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: assignedToId },
      include: {
        roleAssignments: {
          include: { role: true },
        },
      },
    });

    if (!user || user.status !== 'active') {
      throw new BadRequestException({
        code: ErrorCode.TASK_ASSIGNMENT_INVALID,
        message: 'Assigned user does not exist or is not active',
      });
    }

    const now = new Date();
    const hasExecutive = user.roleAssignments.some(
      (ra) =>
        ra.termStart <= now &&
        (!ra.termEnd || ra.termEnd >= now) &&
        ([RoleCode.PRESIDENT, RoleCode.VP, RoleCode.ADMIN] as string[]).includes(ra.role.code),
    );

    if (hasExecutive) return;

    const hasCommitteeAssignment = user.roleAssignments.some(
      (ra) =>
        ra.committeeId === committeeId &&
        ra.termStart <= now &&
        (!ra.termEnd || ra.termEnd >= now) &&
        ([RoleCode.CORE, RoleCode.SUBCORE, RoleCode.COMMITTEE] as string[]).includes(ra.role.code),
    );

    if (!hasCommitteeAssignment) {
      throw new BadRequestException({
        code: ErrorCode.TASK_ASSIGNMENT_INVALID,
        message: 'Assigned user is not an active member of this committee',
      });
    }
  }

  /**
   * Create a new task within a committee workspace
   */
  async createTask(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    input: CreateTaskInput,
    ip?: string,
  ): Promise<TaskResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    if (input.assignedToId) {
      await this.validateAssignee(committee.id, input.assignedToId);
    }

    if (input.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: input.eventId },
      });
      if (!event) {
        throw new NotFoundException({
          code: ErrorCode.EVENT_NOT_FOUND,
          message: `Event '${input.eventId}' not found`,
        });
      }
    }

    const task = await this.prisma.task.create({
      data: {
        committeeId: committee.id,
        eventId: input.eventId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        assignedToId: input.assignedToId ?? null,
        createdById: userId,
      },
      include: {
        committee: true,
        event: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'task.created',
        targetType: 'task',
        targetId: task.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        afterJson: {
          taskId: task.id,
          committeeCode: committee.code,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assignedToId: task.assignedToId,
        },
      },
    });

    return {
      id: task.id,
      committeeId: task.committeeId,
      committeeCode: task.committee.code,
      eventId: task.eventId,
      eventTitle: task.event?.title ?? null,
      title: task.title,
      description: task.description,
      status: task.status as TaskResponse['status'],
      priority: task.priority as TaskResponse['priority'],
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      assignedToId: task.assignedToId,
      assignedTo: task.assignedTo
        ? {
            id: task.assignedTo.id,
            fullName: task.assignedTo.name,
            email: task.assignedTo.email,
          }
        : null,
      createdById: task.createdById,
      createdBy: {
        id: task.createdBy.id,
        fullName: task.createdBy.name,
        email: task.createdBy.email,
      },
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieve all tasks for a committee workspace
   */
  async getTasks(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    filters?: {
      status?: string;
      priority?: string;
      assignedToId?: string;
      eventId?: string;
    },
  ): Promise<TaskListResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const where: {
      committeeId: string;
      status?: string;
      priority?: string;
      assignedToId?: string;
      eventId?: string;
    } = {
      committeeId: committee.id,
    };

    if (filters?.status) where.status = filters.status;
    if (filters?.priority) where.priority = filters.priority;
    if (filters?.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters?.eventId) where.eventId = filters.eventId;

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        committee: true,
        event: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        committeeId: t.committeeId,
        committeeCode: t.committee.code,
        eventId: t.eventId,
        eventTitle: t.event?.title ?? null,
        title: t.title,
        description: t.description,
        status: t.status as TaskResponse['status'],
        priority: t.priority as TaskResponse['priority'],
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        assignedToId: t.assignedToId,
        assignedTo: t.assignedTo
          ? {
              id: t.assignedTo.id,
              fullName: t.assignedTo.name,
              email: t.assignedTo.email,
            }
          : null,
        createdById: t.createdById,
        createdBy: {
          id: t.createdBy.id,
          fullName: t.createdBy.name,
          email: t.createdBy.email,
        },
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
      total: tasks.length,
    };
  }

  /**
   * Get single task by ID
   */
  async getTaskById(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    taskId: string,
  ): Promise<TaskResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        committeeId: committee.id,
      },
      include: {
        committee: true,
        event: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!task) {
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: `Task '${taskId}' not found in committee '${committeeCode}'`,
      });
    }

    return {
      id: task.id,
      committeeId: task.committeeId,
      committeeCode: task.committee.code,
      eventId: task.eventId,
      eventTitle: task.event?.title ?? null,
      title: task.title,
      description: task.description,
      status: task.status as TaskResponse['status'],
      priority: task.priority as TaskResponse['priority'],
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      assignedToId: task.assignedToId,
      assignedTo: task.assignedTo
        ? {
            id: task.assignedTo.id,
            fullName: task.assignedTo.name,
            email: task.assignedTo.email,
          }
        : null,
      createdById: task.createdById,
      createdBy: {
        id: task.createdBy.id,
        fullName: task.createdBy.name,
        email: task.createdBy.email,
      },
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  /**
   * Update an existing task
   */
  async updateTask(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    taskId: string,
    input: UpdateTaskInput,
    ip?: string,
  ): Promise<TaskResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, committeeId: committee.id },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: `Task '${taskId}' not found in committee '${committeeCode}'`,
      });
    }

    if (input.assignedToId !== undefined && input.assignedToId !== null) {
      await this.validateAssignee(committee.id, input.assignedToId);
    }

    if (input.eventId !== undefined && input.eventId !== null) {
      const event = await this.prisma.event.findUnique({
        where: { id: input.eventId },
      });
      if (!event) {
        throw new NotFoundException({
          code: ErrorCode.EVENT_NOT_FOUND,
          message: `Event '${input.eventId}' not found`,
        });
      }
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title !== undefined ? input.title : existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        status: input.status !== undefined ? input.status : existing.status,
        priority: input.priority !== undefined ? input.priority : existing.priority,
        dueDate: input.dueDate !== undefined ? (input.dueDate ? new Date(input.dueDate) : null) : existing.dueDate,
        assignedToId: input.assignedToId !== undefined ? input.assignedToId : existing.assignedToId,
        eventId: input.eventId !== undefined ? input.eventId : existing.eventId,
      },
      include: {
        committee: true,
        event: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'task.updated',
        targetType: 'task',
        targetId: updated.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        beforeJson: {
          title: existing.title,
          status: existing.status,
          priority: existing.priority,
          assignedToId: existing.assignedToId,
        },
        afterJson: {
          title: updated.title,
          status: updated.status,
          priority: updated.priority,
          assignedToId: updated.assignedToId,
        },
      },
    });

    return {
      id: updated.id,
      committeeId: updated.committeeId,
      committeeCode: updated.committee.code,
      eventId: updated.eventId,
      eventTitle: updated.event?.title ?? null,
      title: updated.title,
      description: updated.description,
      status: updated.status as TaskResponse['status'],
      priority: updated.priority as TaskResponse['priority'],
      dueDate: updated.dueDate ? updated.dueDate.toISOString() : null,
      assignedToId: updated.assignedToId,
      assignedTo: updated.assignedTo
        ? {
            id: updated.assignedTo.id,
            fullName: updated.assignedTo.name,
            email: updated.assignedTo.email,
          }
        : null,
      createdById: updated.createdById,
      createdBy: {
        id: updated.createdBy.id,
        fullName: updated.createdBy.name,
        email: updated.createdBy.email,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete a task
   */
  async deleteTask(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    taskId: string,
    ip?: string,
  ): Promise<{ success: boolean; taskId: string }> {
    const { committee, isExecutive, activeRoleCode } =
      await this.workspacesService.validateCommitteeAccess(
        userId,
        userRoles,
        committeeCode,
      );

    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, committeeId: committee.id },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.TASK_NOT_FOUND,
        message: `Task '${taskId}' not found in committee '${committeeCode}'`,
      });
    }

    const isCreator = existing.createdById === userId;
    const isLead = activeRoleCode === RoleCode.CORE;

    if (!isCreator && !isLead && !isExecutive) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the task creator, committee lead, or executive may delete this task',
      });
    }

    await this.prisma.task.delete({
      where: { id: taskId },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'task.deleted',
        targetType: 'task',
        targetId: taskId,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        beforeJson: {
          taskId,
          committeeCode: committee.code,
          title: existing.title,
        },
      },
    });

    return { success: true, taskId };
  }
}
