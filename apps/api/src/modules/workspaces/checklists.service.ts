import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { WorkspacesService } from './workspaces.service.js';
import {
  RoleCode,
  ErrorCode,
  CreateChecklistInput,
  CreateChecklistItemInput,
  UpdateChecklistItemInput,
  CreateChecklistRunInput,
  SignOffChecklistRunInput,
  ChecklistResponse,
  ChecklistItemResponse,
  ChecklistRunResponse,
  ChecklistRunStatus,
} from '@csi/shared';

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Create a new checklist (e.g. Pre-Event Run Checklist or operational protocol)
   */
  async createChecklist(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    input: CreateChecklistInput,
    ip?: string,
  ): Promise<ChecklistResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

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

    if (input.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: input.taskId, committeeId: committee.id },
      });
      if (!task) {
        throw new NotFoundException({
          code: ErrorCode.TASK_NOT_FOUND,
          message: `Task '${input.taskId}' not found in committee '${committeeCode}'`,
        });
      }
    }

    const checklist = await this.prisma.checklist.create({
      data: {
        committeeId: committee.id,
        eventId: input.eventId ?? null,
        taskId: input.taskId ?? null,
        title: input.title,
        description: input.description ?? null,
        isTemplate: input.isTemplate ?? false,
        createdById: userId,
        items: input.items && input.items.length > 0
          ? {
              create: input.items.map((item, index) => ({
                title: item.title,
                description: item.description ?? null,
                assignedToId: item.assignedToId ?? null,
                orderIndex: item.orderIndex ?? index,
              })),
            }
          : undefined,
      },
      include: {
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            completedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'checklist.created',
        targetType: 'checklist',
        targetId: checklist.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        afterJson: {
          checklistId: checklist.id,
          committeeCode: committee.code,
          title: checklist.title,
          isTemplate: checklist.isTemplate,
          itemsCount: checklist.items.length,
        },
      },
    });

    return {
      id: checklist.id,
      committeeId: checklist.committeeId,
      committeeCode: checklist.committee.code,
      eventId: checklist.eventId,
      eventTitle: checklist.event?.title ?? null,
      taskId: checklist.taskId,
      title: checklist.title,
      description: checklist.description,
      isTemplate: checklist.isTemplate,
      items: checklist.items.map((item) => ({
        id: item.id,
        checklistId: item.checklistId,
        title: item.title,
        description: item.description,
        isCompleted: item.isCompleted,
        completedAt: item.completedAt ? item.completedAt.toISOString() : null,
        completedById: item.completedById,
        completedBy: item.completedBy
          ? { id: item.completedBy.id, fullName: item.completedBy.name, email: item.completedBy.email }
          : null,
        assignedToId: item.assignedToId,
        assignedTo: item.assignedTo
          ? { id: item.assignedTo.id, fullName: item.assignedTo.name, email: item.assignedTo.email }
          : null,
        orderIndex: item.orderIndex,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      totalItems: checklist.items.length,
      completedItems: checklist.items.filter((i) => i.isCompleted).length,
      createdById: checklist.createdById,
      createdBy: {
        id: checklist.createdBy.id,
        fullName: checklist.createdBy.name,
        email: checklist.createdBy.email,
      },
      createdAt: checklist.createdAt.toISOString(),
      updatedAt: checklist.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieve all checklists for a committee
   */
  async getChecklists(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
  ): Promise<ChecklistResponse[]> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const checklists = await this.prisma.checklist.findMany({
      where: { committeeId: committee.id },
      include: {
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            completedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return checklists.map((c) => ({
      id: c.id,
      committeeId: c.committeeId,
      committeeCode: c.committee.code,
      eventId: c.eventId,
      eventTitle: c.event?.title ?? null,
      taskId: c.taskId,
      title: c.title,
      description: c.description,
      isTemplate: c.isTemplate,
      items: c.items.map((i) => ({
        id: i.id,
        checklistId: i.checklistId,
        title: i.title,
        description: i.description,
        isCompleted: i.isCompleted,
        completedAt: i.completedAt ? i.completedAt.toISOString() : null,
        completedById: i.completedById,
        completedBy: i.completedBy
          ? { id: i.completedBy.id, fullName: i.completedBy.name, email: i.completedBy.email }
          : null,
        assignedToId: i.assignedToId,
        assignedTo: i.assignedTo
          ? { id: i.assignedTo.id, fullName: i.assignedTo.name, email: i.assignedTo.email }
          : null,
        orderIndex: i.orderIndex,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      totalItems: c.items.length,
      completedItems: c.items.filter((i) => i.isCompleted).length,
      createdById: c.createdById,
      createdBy: {
        id: c.createdBy.id,
        fullName: c.createdBy.name,
        email: c.createdBy.email,
      },
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /**
   * Get single checklist by ID
   */
  async getChecklistById(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    checklistId: string,
  ): Promise<ChecklistResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, committeeId: committee.id },
      include: {
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            completedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!checklist) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_NOT_FOUND,
        message: `Checklist '${checklistId}' not found in committee '${committeeCode}'`,
      });
    }

    return {
      id: checklist.id,
      committeeId: checklist.committeeId,
      committeeCode: checklist.committee.code,
      eventId: checklist.eventId,
      eventTitle: checklist.event?.title ?? null,
      taskId: checklist.taskId,
      title: checklist.title,
      description: checklist.description,
      isTemplate: checklist.isTemplate,
      items: checklist.items.map((i) => ({
        id: i.id,
        checklistId: i.checklistId,
        title: i.title,
        description: i.description,
        isCompleted: i.isCompleted,
        completedAt: i.completedAt ? i.completedAt.toISOString() : null,
        completedById: i.completedById,
        completedBy: i.completedBy
          ? { id: i.completedBy.id, fullName: i.completedBy.name, email: i.completedBy.email }
          : null,
        assignedToId: i.assignedToId,
        assignedTo: i.assignedTo
          ? { id: i.assignedTo.id, fullName: i.assignedTo.name, email: i.assignedTo.email }
          : null,
        orderIndex: i.orderIndex,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      totalItems: checklist.items.length,
      completedItems: checklist.items.filter((i) => i.isCompleted).length,
      createdById: checklist.createdById,
      createdBy: {
        id: checklist.createdBy.id,
        fullName: checklist.createdBy.name,
        email: checklist.createdBy.email,
      },
      createdAt: checklist.createdAt.toISOString(),
      updatedAt: checklist.updatedAt.toISOString(),
    };
  }

  /**
   * Add item to checklist
   */
  async addChecklistItem(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    checklistId: string,
    input: CreateChecklistItemInput,
  ): Promise<ChecklistItemResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, committeeId: committee.id },
    });

    if (!checklist) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_NOT_FOUND,
        message: `Checklist '${checklistId}' not found in committee '${committeeCode}'`,
      });
    }

    const maxOrder = await this.prisma.checklistItem.aggregate({
      where: { checklistId },
      _max: { orderIndex: true },
    });

    const nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;

    const item = await this.prisma.checklistItem.create({
      data: {
        checklistId,
        title: input.title,
        description: input.description ?? null,
        assignedToId: input.assignedToId ?? null,
        orderIndex: input.orderIndex ?? nextOrder,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        completedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      id: item.id,
      checklistId: item.checklistId,
      title: item.title,
      description: item.description,
      isCompleted: item.isCompleted,
      completedAt: item.completedAt ? item.completedAt.toISOString() : null,
      completedById: item.completedById,
      completedBy: item.completedBy
        ? { id: item.completedBy.id, fullName: item.completedBy.name, email: item.completedBy.email }
        : null,
      assignedToId: item.assignedToId,
      assignedTo: item.assignedTo
        ? { id: item.assignedTo.id, fullName: item.assignedTo.name, email: item.assignedTo.email }
        : null,
      orderIndex: item.orderIndex,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  /**
   * Toggle or update item completion state
   */
  async updateChecklistItem(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    checklistId: string,
    itemId: string,
    input: UpdateChecklistItemInput,
  ): Promise<ChecklistItemResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, committeeId: committee.id },
    });

    if (!checklist) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_NOT_FOUND,
        message: `Checklist '${checklistId}' not found in committee '${committeeCode}'`,
      });
    }

    const existing = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, checklistId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_ITEM_NOT_FOUND,
        message: `Checklist item '${itemId}' not found`,
      });
    }

    let completedAt = existing.completedAt;
    let completedById = existing.completedById;

    if (input.isCompleted !== undefined) {
      if (input.isCompleted) {
        completedAt = new Date();
        completedById = userId;
      } else {
        completedAt = null;
        completedById = null;
      }
    }

    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        title: input.title !== undefined ? input.title : existing.title,
        description: input.description !== undefined ? input.description : existing.description,
        isCompleted: input.isCompleted !== undefined ? input.isCompleted : existing.isCompleted,
        completedAt,
        completedById,
        assignedToId: input.assignedToId !== undefined ? input.assignedToId : existing.assignedToId,
        orderIndex: input.orderIndex !== undefined ? input.orderIndex : existing.orderIndex,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        completedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      id: updated.id,
      checklistId: updated.checklistId,
      title: updated.title,
      description: updated.description,
      isCompleted: updated.isCompleted,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      completedById: updated.completedById,
      completedBy: updated.completedBy
        ? { id: updated.completedBy.id, fullName: updated.completedBy.name, email: updated.completedBy.email }
        : null,
      assignedToId: updated.assignedToId,
      assignedTo: updated.assignedTo
        ? { id: updated.assignedTo.id, fullName: updated.assignedTo.name, email: updated.assignedTo.email }
        : null,
      orderIndex: updated.orderIndex,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete checklist item
   */
  async deleteChecklistItem(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    checklistId: string,
    itemId: string,
  ): Promise<{ success: boolean; itemId: string }> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const checklist = await this.prisma.checklist.findFirst({
      where: { id: checklistId, committeeId: committee.id },
    });

    if (!checklist) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_NOT_FOUND,
        message: `Checklist '${checklistId}' not found`,
      });
    }

    const item = await this.prisma.checklistItem.findFirst({
      where: { id: itemId, checklistId },
    });

    if (!item) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_ITEM_NOT_FOUND,
        message: `Checklist item '${itemId}' not found`,
      });
    }

    await this.prisma.checklistItem.delete({
      where: { id: itemId },
    });

    return { success: true, itemId };
  }

  /**
   * Instantiate an interactive Pre-Event Checklist Run
   */
  async createChecklistRun(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    input: CreateChecklistRunInput,
    ip?: string,
  ): Promise<ChecklistRunResponse> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const checklist = await this.prisma.checklist.findFirst({
      where: { id: input.checklistId, committeeId: committee.id },
      include: {
        items: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            completedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!checklist) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_NOT_FOUND,
        message: `Checklist '${input.checklistId}' not found in committee '${committeeCode}'`,
      });
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

    const run = await this.prisma.checklistRun.create({
      data: {
        checklistId: checklist.id,
        committeeId: committee.id,
        eventId: input.eventId ?? checklist.eventId ?? null,
        status: ChecklistRunStatus.IN_PROGRESS,
        createdById: userId,
      },
      include: {
        checklist: true,
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'checklist_run.created',
        targetType: 'checklist_run',
        targetId: run.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        afterJson: {
          runId: run.id,
          checklistId: checklist.id,
          committeeCode: committee.code,
          eventId: run.eventId,
        },
      },
    });

    return {
      id: run.id,
      checklistId: run.checklistId,
      checklistTitle: run.checklist.title,
      committeeId: run.committeeId,
      committeeCode: run.committee.code,
      eventId: run.eventId,
      eventTitle: run.event?.title ?? null,
      status: run.status as ChecklistRunResponse['status'],
      signedOffById: null,
      signedOffBy: null,
      signedOffAt: null,
      signOffNotes: null,
      createdById: run.createdById,
      createdBy: {
        id: run.createdBy.id,
        fullName: run.createdBy.name,
        email: run.createdBy.email,
      },
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      items: checklist.items.map((i) => ({
        id: i.id,
        checklistId: i.checklistId,
        title: i.title,
        description: i.description,
        isCompleted: i.isCompleted,
        completedAt: i.completedAt ? i.completedAt.toISOString() : null,
        completedById: i.completedById,
        completedBy: i.completedBy
          ? { id: i.completedBy.id, fullName: i.completedBy.name, email: i.completedBy.email }
          : null,
        assignedToId: i.assignedToId,
        assignedTo: i.assignedTo
          ? { id: i.assignedTo.id, fullName: i.assignedTo.name, email: i.assignedTo.email }
          : null,
        orderIndex: i.orderIndex,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    };
  }

  /**
   * Retrieve all checklist runs for a committee
   */
  async getChecklistRuns(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
  ): Promise<ChecklistRunResponse[]> {
    const { committee } = await this.workspacesService.validateCommitteeAccess(
      userId,
      userRoles,
      committeeCode,
    );

    const runs = await this.prisma.checklistRun.findMany({
      where: { committeeId: committee.id },
      include: {
        checklist: true,
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
        signedOffBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return runs.map((r) => ({
      id: r.id,
      checklistId: r.checklistId,
      checklistTitle: r.checklist.title,
      committeeId: r.committeeId,
      committeeCode: r.committee.code,
      eventId: r.eventId,
      eventTitle: r.event?.title ?? null,
      status: r.status as ChecklistRunResponse['status'],
      signedOffById: r.signedOffById,
      signedOffBy: r.signedOffBy
        ? { id: r.signedOffBy.id, fullName: r.signedOffBy.name, email: r.signedOffBy.email }
        : null,
      signedOffAt: r.signedOffAt ? r.signedOffAt.toISOString() : null,
      signOffNotes: r.signOffNotes,
      createdById: r.createdById,
      createdBy: {
        id: r.createdBy.id,
        fullName: r.createdBy.name,
        email: r.createdBy.email,
      },
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Sign off on an operational checklist run (Accountability sign-off)
   * Restricted to CORE heads, SUBCORE, or Executive board.
   */
  async signOffChecklistRun(
    userId: string,
    userRoles: RoleCode[],
    committeeCode: string,
    runId: string,
    input: SignOffChecklistRunInput,
    ip?: string,
  ): Promise<ChecklistRunResponse> {
    const { committee, isExecutive, activeRoleCode } =
      await this.workspacesService.validateCommitteeAccess(
        userId,
        userRoles,
        committeeCode,
      );

    const isLeadOrExecutive =
      isExecutive ||
      activeRoleCode === RoleCode.CORE ||
      activeRoleCode === RoleCode.SUBCORE;

    if (!isLeadOrExecutive) {
      throw new ForbiddenException({
        code: ErrorCode.CHECKLIST_SIGN_OFF_UNAUTHORIZED,
        message: 'Only committee heads, sub-core executives, or branch leadership can sign off on checklist runs',
      });
    }

    const run = await this.prisma.checklistRun.findFirst({
      where: { id: runId, committeeId: committee.id },
      include: {
        checklist: {
          include: {
            items: {
              include: {
                assignedTo: { select: { id: true, name: true, email: true } },
                completedBy: { select: { id: true, name: true, email: true } },
              },
              orderBy: { orderIndex: 'asc' },
            },
          },
        },
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: ErrorCode.CHECKLIST_RUN_NOT_FOUND,
        message: `Checklist run '${runId}' not found in committee '${committeeCode}'`,
      });
    }

    if (run.status === ChecklistRunStatus.SIGNED_OFF) {
      throw new ConflictException({
        code: ErrorCode.CHECKLIST_RUN_ALREADY_SIGNED,
        message: `Checklist run '${runId}' has already been signed off on ${run.signedOffAt?.toISOString()}`,
      });
    }

    const updated = await this.prisma.checklistRun.update({
      where: { id: runId },
      data: {
        status: ChecklistRunStatus.SIGNED_OFF,
        signedOffAt: new Date(),
        signedOffById: userId,
        signOffNotes: input.signOffNotes ?? null,
      },
      include: {
        checklist: true,
        committee: true,
        event: true,
        createdBy: { select: { id: true, name: true, email: true } },
        signedOffBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'checklist_run.signed_off',
        targetType: 'checklist_run',
        targetId: updated.id,
        actorId: userId,
        ip: ip ?? '127.0.0.1',
        afterJson: {
          runId: updated.id,
          committeeCode: committee.code,
          signedOffById: userId,
          signOffNotes: updated.signOffNotes,
        },
      },
    });

    return {
      id: updated.id,
      checklistId: updated.checklistId,
      checklistTitle: updated.checklist.title,
      committeeId: updated.committeeId,
      committeeCode: updated.committee.code,
      eventId: updated.eventId,
      eventTitle: updated.event?.title ?? null,
      status: updated.status as ChecklistRunResponse['status'],
      signedOffById: updated.signedOffById,
      signedOffBy: updated.signedOffBy
        ? { id: updated.signedOffBy.id, fullName: updated.signedOffBy.name, email: updated.signedOffBy.email }
        : null,
      signedOffAt: updated.signedOffAt ? updated.signedOffAt.toISOString() : null,
      signOffNotes: updated.signOffNotes,
      createdById: updated.createdById,
      createdBy: {
        id: updated.createdBy.id,
        fullName: updated.createdBy.name,
        email: updated.createdBy.email,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      items: run.checklist.items.map((i) => ({
        id: i.id,
        checklistId: i.checklistId,
        title: i.title,
        description: i.description,
        isCompleted: i.isCompleted,
        completedAt: i.completedAt ? i.completedAt.toISOString() : null,
        completedById: i.completedById,
        completedBy: i.completedBy
          ? { id: i.completedBy.id, fullName: i.completedBy.name, email: i.completedBy.email }
          : null,
        assignedToId: i.assignedToId,
        assignedTo: i.assignedTo
          ? { id: i.assignedTo.id, fullName: i.assignedTo.name, email: i.assignedTo.email }
          : null,
        orderIndex: i.orderIndex,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    };
  }
}
