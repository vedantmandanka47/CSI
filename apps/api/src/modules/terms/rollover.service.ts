import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  RolloverPreviewRequest,
  RolloverPreviewResponse,
  ExecuteRolloverRequest,
  RolloverExecutionResponse,
  TermSnapshotResponse,
  RolloverHistoryResponse,
  TermStatus,
  UserStatus,
  RoleCode,
  ErrorCode,
} from '@csi/shared';

@Injectable()
export class RolloverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate an execution preview of the proposed rollover transition
   */
  async generatePreview(
    params: RolloverPreviewRequest,
  ): Promise<RolloverPreviewResponse> {
    // 1. Resolve Target Term
    const toTerm = await this.prisma.academicTerm.findUnique({
      where: { id: params.toTermId },
    });

    if (!toTerm) {
      throw new NotFoundException({
        code: ErrorCode.TERM_NOT_FOUND,
        message: `Target academic term "${params.toTermId}" was not found`,
      });
    }

    if (toTerm.status === TermStatus.ARCHIVED) {
      throw new BadRequestException({
        code: ErrorCode.ROLLOVER_INVALID_TRANSITION,
        message: `Target academic term "${toTerm.code}" is already archived and cannot be activated`,
      });
    }

    // 2. Resolve Outgoing Term (defaults to current active term if not specified)
    let fromTerm = null;
    if (params.fromTermId) {
      fromTerm = await this.prisma.academicTerm.findUnique({
        where: { id: params.fromTermId },
      });
      if (!fromTerm) {
        throw new NotFoundException({
          code: ErrorCode.TERM_NOT_FOUND,
          message: `Outgoing academic term "${params.fromTermId}" was not found`,
        });
      }
    } else {
      fromTerm = await this.prisma.academicTerm.findFirst({
        where: { isCurrent: true },
      });
      if (!fromTerm) {
        fromTerm = await this.prisma.academicTerm.findFirst({
          where: { status: TermStatus.ACTIVE },
          orderBy: { startDate: 'desc' },
        });
      }
    }

    if (fromTerm && fromTerm.id === toTerm.id) {
      throw new BadRequestException({
        code: ErrorCode.ROLLOVER_INVALID_TRANSITION,
        message: 'Source and target academic terms cannot be identical',
      });
    }

    const now = new Date();

    // 3. Identify Outgoing Appointments (active assignments)
    // Exclude system administrators and permanent faculty advisors from tenure termination
    const rolesToExclude = await this.prisma.role.findMany({
      where: { code: { in: [RoleCode.ADMIN, RoleCode.FACULTY] } },
      select: { id: true },
    });
    const excludedRoleIds = rolesToExclude.map((r) => r.id);

    const outgoingRoles = await this.prisma.roleAssignment.findMany({
      where: {
        roleId: { notIn: excludedRoleIds },
        OR: [{ termEnd: null }, { termEnd: { gt: now } }],
      },
      include: {
        user: true,
        role: true,
        committee: true,
      },
    });

    const outgoingAppointments = outgoingRoles.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      userEmail: r.user.email,
      roleCode: r.role.code,
      roleName: r.role.name,
      committeeCode: r.committee ? r.committee.code : null,
      committeeName: r.committee ? r.committee.name : null,
      termStart: r.termStart.toISOString(),
      termEnd: r.termEnd ? r.termEnd.toISOString() : null,
    }));

    // 4. Identify Graduating Members (active users in year 4 or active students)
    const activeUsers = await this.prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      include: {
        roleAssignments: {
          include: { role: true },
        },
      },
    });

    // Check roster entries for year >= 4
    const graduatingUsers = [];
    for (const u of activeUsers) {
      let isGraduating = false;
      let branchName = null;
      let yearNum = null;

      if (u.enrollmentNo) {
        const roster = await this.prisma.rosterEntry.findFirst({
          where: { enrollmentNo: u.enrollmentNo },
          orderBy: { importedAt: 'desc' },
        });
        if (roster) {
          branchName = roster.branch;
          yearNum = roster.year;
          if (roster.year >= 4) {
            isGraduating = true;
          }
        }
      }

      if (isGraduating) {
        graduatingUsers.push({
          id: u.id,
          name: u.name,
          email: u.email,
          year: yearNum,
          branch: branchName,
          currentRoles: u.roleAssignments.map((ra) => ra.role.name),
        });
      }
    }

    // 5. Identify Unresolved Operational Workflows
    const openTasks = await this.prisma.task.findMany({
      where: {
        status: { in: ['todo', 'in_progress', 'in_review'] },
      },
      include: {
        committee: true,
      },
    });

    const openChecklistRuns = await this.prisma.checklistRun.findMany({
      where: {
        status: 'in_progress',
      },
      include: {
        checklist: true,
        committee: true,
      },
    });

    const pendingAssets = await this.prisma.committeeAsset.findMany({
      where: {
        status: { in: ['draft', 'in_review'] },
      },
      include: {
        committee: true,
      },
    });

    // 6. Validate Proposed Incoming Appointments
    const incomingValidation = [];
    const blockingReasons: string[] = [];
    const warnings: string[] = [];

    const seenAppointments = new Set<string>();

    for (const appt of params.incomingAppointments || []) {
      const user = await this.prisma.user.findUnique({
        where: { id: appt.userId },
      });

      const role = await this.prisma.role.findUnique({
        where: { code: appt.roleCode },
      });

      let committee = null;
      if (appt.committeeCode) {
        committee = await this.prisma.committee.findUnique({
          where: { code: appt.committeeCode },
        });
      }

      const dedupeKey = `${appt.userId}:${appt.roleCode}:${appt.committeeCode || 'none'}`;
      let isValid = true;
      let errorMsg: string | undefined = undefined;

      if (!user) {
        isValid = false;
        errorMsg = `User "${appt.userId}" does not exist`;
      } else if (user.status !== UserStatus.ACTIVE) {
        isValid = false;
        errorMsg = `User "${user.name}" is not active (status: ${user.status})`;
      } else if (!role) {
        isValid = false;
        errorMsg = `Role code "${appt.roleCode}" does not exist`;
      } else if (appt.committeeCode && !committee) {
        isValid = false;
        errorMsg = `Committee "${appt.committeeCode}" does not exist`;
      } else if (seenAppointments.has(dedupeKey)) {
        isValid = false;
        errorMsg = `Duplicate incoming appointment for user ${user.name} with role ${appt.roleCode}`;
      }

      seenAppointments.add(dedupeKey);

      if (!isValid) {
        blockingReasons.push(errorMsg || 'Invalid incoming appointment');
      }

      incomingValidation.push({
        userId: appt.userId,
        userName: user?.name,
        roleCode: appt.roleCode,
        committeeCode: appt.committeeCode,
        isValid,
        error: errorMsg,
      });
    }

    if (openTasks.length > 0) {
      warnings.push(
        `${openTasks.length} task(s) currently open across committees will be flagged/archived during rollover`,
      );
    }

    if (openChecklistRuns.length > 0) {
      warnings.push(
        `${openChecklistRuns.length} pre-event checklist run(s) are incomplete`,
      );
    }

    if (pendingAssets.length > 0) {
      warnings.push(
        `${pendingAssets.length} media asset(s) are awaiting review or in draft status`,
      );
    }

    const canExecute = blockingReasons.length === 0;
    const suggestedConfirmationCode = `CONFIRM_ROLLOVER_${toTerm.code}`;

    return {
      fromTerm: fromTerm ? this.mapTerm(fromTerm) : null,
      toTerm: this.mapTerm(toTerm),
      outgoingAppointments,
      graduatingMembers: graduatingUsers,
      unresolvedWorkflows: {
        openTasks: openTasks.map((t) => ({
          id: t.id,
          title: t.title,
          committeeCode: t.committee.code,
          status: t.status,
          priority: t.priority,
        })),
        openChecklistRuns: openChecklistRuns.map((r) => ({
          id: r.id,
          checklistTitle: r.checklist.title,
          committeeCode: r.committee.code,
          status: r.status,
        })),
        pendingAssets: pendingAssets.map((a) => ({
          id: a.id,
          title: a.title,
          committeeCode: a.committee.code,
          status: a.status,
        })),
      },
      incomingAppointmentsValidation: incomingValidation,
      canExecute,
      blockingReasons,
      warnings,
      suggestedConfirmationCode,
    };
  }

  /**
   * Execute the annual term rollover transaction
   */
  async executeRollover(
    actorId: string,
    params: ExecuteRolloverRequest,
  ): Promise<RolloverExecutionResponse> {
    // 1. Resolve Target Term
    const toTerm = await this.prisma.academicTerm.findUnique({
      where: { id: params.toTermId },
    });

    if (!toTerm) {
      throw new NotFoundException({
        code: ErrorCode.TERM_NOT_FOUND,
        message: `Target academic term "${params.toTermId}" was not found`,
      });
    }

    if (toTerm.status === TermStatus.ARCHIVED) {
      throw new BadRequestException({
        code: ErrorCode.ROLLOVER_INVALID_TRANSITION,
        message: `Target academic term "${toTerm.code}" is archived and cannot receive rollovers`,
      });
    }

    // 2. Validate confirmation code
    const expectedConfirmationCode = `CONFIRM_ROLLOVER_${toTerm.code}`;
    if (params.confirmationCode !== expectedConfirmationCode) {
      throw new BadRequestException({
        code: ErrorCode.ROLLOVER_CONFIRMATION_INVALID,
        message: `Confirmation code is invalid. Expected "${expectedConfirmationCode}"`,
      });
    }

    // 3. Resolve Outgoing Term
    let fromTerm = null;
    if (params.fromTermId) {
      fromTerm = await this.prisma.academicTerm.findUnique({
        where: { id: params.fromTermId },
      });
      if (!fromTerm) {
        throw new NotFoundException({
          code: ErrorCode.TERM_NOT_FOUND,
          message: `Outgoing academic term "${params.fromTermId}" was not found`,
        });
      }
    } else {
      fromTerm = await this.prisma.academicTerm.findFirst({
        where: { isCurrent: true },
      });
      if (!fromTerm) {
        fromTerm = await this.prisma.academicTerm.findFirst({
          where: { status: TermStatus.ACTIVE },
          orderBy: { startDate: 'desc' },
        });
      }
    }

    if (fromTerm && fromTerm.id === toTerm.id) {
      throw new BadRequestException({
        code: ErrorCode.ROLLOVER_INVALID_TRANSITION,
        message: 'Source and target academic terms cannot be identical',
      });
    }

    if (fromTerm && fromTerm.status === TermStatus.ARCHIVED) {
      throw new ConflictException({
        code: ErrorCode.ROLLOVER_ALREADY_EXECUTED,
        message: `Outgoing academic term "${fromTerm.code}" is already archived`,
      });
    }

    // 4. Pre-validate all incoming appointments before entering transaction
    const resolvedAppointments: {
      userId: string;
      roleId: string;
      committeeId: string | null;
    }[] = [];

    const seenAppointments = new Set<string>();

    for (const appt of params.incomingAppointments || []) {
      const user = await this.prisma.user.findUnique({
        where: { id: appt.userId },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new BadRequestException({
          code: ErrorCode.ROLLOVER_APPOINTMENT_INVALID,
          message: `User "${appt.userId}" is invalid or not in active status`,
        });
      }

      const role = await this.prisma.role.findUnique({
        where: { code: appt.roleCode },
      });
      if (!role) {
        throw new BadRequestException({
          code: ErrorCode.ROLLOVER_APPOINTMENT_INVALID,
          message: `Role code "${appt.roleCode}" does not exist`,
        });
      }

      let committeeId: string | null = null;
      if (appt.committeeCode) {
        const committee = await this.prisma.committee.findUnique({
          where: { code: appt.committeeCode },
        });
        if (!committee) {
          throw new BadRequestException({
            code: ErrorCode.ROLLOVER_APPOINTMENT_INVALID,
            message: `Committee "${appt.committeeCode}" does not exist`,
          });
        }
        committeeId = committee.id;
      }

      const dedupeKey = `${appt.userId}:${role.id}:${committeeId || 'none'}`;
      if (seenAppointments.has(dedupeKey)) {
        throw new BadRequestException({
          code: ErrorCode.ROLLOVER_APPOINTMENT_INVALID,
          message: `Duplicate appointment for user "${user.name}" with role "${role.name}"`,
        });
      }
      seenAppointments.add(dedupeKey);

      resolvedAppointments.push({
        userId: user.id,
        roleId: role.id,
        committeeId,
      });
    }

    const now = new Date();

    // 5. Execute Atomically in Transaction
    return await this.prisma.$transaction(async (tx) => {
      let outgoingRolesClosedCount = 0;
      let graduatingMembersCount = 0;
      let tasksArchivedCount = 0;
      let snapshotId: string | null = null;

      // A. If an outgoing term exists, close it and capture historical snapshot
      if (fromTerm) {
        // Close active role assignments by setting termEnd = now
        // Exclude system administrators and permanent faculty advisors from tenure termination
        const rolesToExclude = await tx.role.findMany({
          where: { code: { in: [RoleCode.ADMIN, RoleCode.FACULTY] } },
          select: { id: true },
        });
        const excludedRoleIds = rolesToExclude.map((r) => r.id);

        const closedRoles = await tx.roleAssignment.updateMany({
          where: {
            roleId: { notIn: excludedRoleIds },
            OR: [{ termEnd: null }, { termEnd: { gt: now } }],
          },
          data: {
            termEnd: now,
          },
        });
        outgoingRolesClosedCount = closedRoles.count;

        // Transition graduating students (year >= 4) to alumnus status
        if (params.transitionGraduatingMembers) {
          const graduatingRosters = await tx.rosterEntry.findMany({
            where: { year: { gte: 4 } },
          });
          const graduatingEnrollments = graduatingRosters.map((r) => r.enrollmentNo);

          if (graduatingEnrollments.length > 0) {
            const updatedGraduates = await tx.user.updateMany({
              where: {
                enrollmentNo: { in: graduatingEnrollments },
                status: UserStatus.ACTIVE,
              },
              data: {
                status: UserStatus.GRADUATED,
              },
            });
            graduatingMembersCount = updatedGraduates.count;
          }
        }

        // Archive open tasks from outgoing term
        if (params.archiveOpenTasks) {
          const openTasks = await tx.task.updateMany({
            where: {
              status: { in: ['todo', 'in_progress', 'in_review'] },
            },
            data: {
              status: 'cancelled',
            },
          });
          tasksArchivedCount = openTasks.count;
        }

        // Capture historical term snapshot
        const totalEvents = await tx.event.count({
          where: {
            startsAt: {
              gte: fromTerm.startDate,
              lte: fromTerm.endDate,
            },
          },
        });

        const totalAttendance = await tx.attendanceRecord.count({
          where: {
            status: 'verified',
            verifiedAt: {
              gte: fromTerm.startDate,
              lte: fromTerm.endDate,
            },
          },
        });

        const totalCertificates = await tx.certificate.count({
          where: {
            status: 'generated',
            issuedAt: {
              gte: fromTerm.startDate,
              lte: fromTerm.endDate,
            },
          },
        });

        const totalPassports = await tx.passport.count({
          where: {
            generatedAt: {
              gte: fromTerm.startDate,
              lte: fromTerm.endDate,
            },
          },
        });

        const totalTasksCompleted = await tx.task.count({
          where: { status: 'completed' },
        });

        const totalChecklistsSignedOff = await tx.checklistRun.count({
          where: { status: 'completed' },
        });

        const totalAssetsApproved = await tx.committeeAsset.count({
          where: { status: 'approved' },
        });

        const activeMembersCount = await tx.user.count({
          where: { status: UserStatus.ACTIVE },
        });

        // Query roster entries at closing
        const closingAssignments = await tx.roleAssignment.findMany({
          where: {
            termStart: { lte: fromTerm.endDate },
            termEnd: { gte: fromTerm.startDate },
          },
          include: {
            user: true,
            role: true,
            committee: true,
          },
        });

        const rosterSnapshot = closingAssignments.map((ca) => ({
          memberName: ca.user.name,
          memberEmail: ca.user.email,
          roleName: ca.role.name,
          roleCode: ca.role.code,
          committeeName: ca.committee ? ca.committee.name : null,
          committeeCode: ca.committee ? ca.committee.code : null,
        }));

        const snapshot = await tx.termSnapshot.create({
          data: {
            termId: fromTerm.id,
            termCode: fromTerm.code,
            termName: fromTerm.name,
            capturedById: actorId,
            snapshotJson: {
              metrics: {
                totalEvents,
                totalAttendance,
                totalCertificatesIssued: totalCertificates,
                totalPassportsGenerated: totalPassports,
                totalTasksCompleted,
                totalTasksArchived: tasksArchivedCount,
                totalChecklistsSignedOff,
                totalAssetsApproved,
                activeMembersCount,
              },
              rosterSnapshot,
            },
          },
        });
        snapshotId = snapshot.id;

        // Mark outgoing term as archived
        await tx.academicTerm.update({
          where: { id: fromTerm.id },
          data: {
            status: TermStatus.ARCHIVED,
            isCurrent: false,
            archivedAt: now,
          },
        });
      }

      // B. Seat incoming appointments
      let incomingRolesCreatedCount = 0;
      for (const appt of resolvedAppointments) {
        await tx.roleAssignment.create({
          data: {
            userId: appt.userId,
            roleId: appt.roleId,
            committeeId: appt.committeeId,
            termStart: toTerm.startDate,
            termEnd: toTerm.endDate,
          },
        });
        incomingRolesCreatedCount++;
      }

      // C. Activate target term as current
      // Ensure all other terms are unset from current
      await tx.academicTerm.updateMany({
        where: { id: { not: toTerm.id } },
        data: { isCurrent: false },
      });

      await tx.academicTerm.update({
        where: { id: toTerm.id },
        data: {
          status: TermStatus.ACTIVE,
          isCurrent: true,
        },
      });

      // D. Create TermRollover execution record
      const rollover = await tx.termRollover.create({
        data: {
          fromTermId: fromTerm ? fromTerm.id : null,
          toTermId: toTerm.id,
          executedById: actorId,
          status: 'completed',
          notes: params.notes || null,
          summaryJson: {
            fromTermId: fromTerm ? fromTerm.id : null,
            fromTermCode: fromTerm ? fromTerm.code : null,
            toTermId: toTerm.id,
            toTermCode: toTerm.code,
            outgoingRolesClosedCount,
            graduatingMembersCount,
            incomingRolesCreatedCount,
            tasksArchivedCount,
            snapshotId,
          },
        },
      });

      // E. Record immutable audit log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'term.rollover_executed',
          targetType: 'term_rollover',
          targetId: rollover.id,
          afterJson: {
            rolloverId: rollover.id,
            fromTermCode: fromTerm ? fromTerm.code : null,
            toTermCode: toTerm.code,
            outgoingRolesClosedCount,
            graduatingMembersCount,
            incomingRolesCreatedCount,
            tasksArchivedCount,
            snapshotId,
            executedAt: now.toISOString(),
          },
        },
      });

      return {
        success: true,
        rolloverId: rollover.id,
        executedAt: now.toISOString(),
        summary: {
          fromTermId: fromTerm ? fromTerm.id : null,
          fromTermCode: fromTerm ? fromTerm.code : null,
          toTermId: toTerm.id,
          toTermCode: toTerm.code,
          outgoingRolesClosedCount,
          graduatingMembersCount,
          incomingRolesCreatedCount,
          tasksArchivedCount,
          snapshotId,
        },
      };
    });
  }

  /**
   * Get history of executed rollovers
   */
  async getRolloverHistory(): Promise<RolloverHistoryResponse> {
    const rollovers = await this.prisma.termRollover.findMany({
      orderBy: { executedAt: 'desc' },
      include: {
        fromTerm: true,
        toTerm: true,
        executedBy: true,
      },
    });

    const data = rollovers.map((r) => ({
      id: r.id,
      fromTermId: r.fromTermId,
      fromTermCode: r.fromTerm ? r.fromTerm.code : null,
      toTermId: r.toTermId,
      toTermCode: r.toTerm.code,
      executedById: r.executedById,
      executedByName: r.executedBy.name,
      executedAt: r.executedAt.toISOString(),
      status: r.status,
      summary: (r.summaryJson as Record<string, unknown>) || {},
      notes: r.notes,
    }));

    return { data };
  }

  /**
   * Get historical snapshot of an academic term
   */
  async getTermSnapshot(termId: string): Promise<TermSnapshotResponse> {
    const snapshot = await this.prisma.termSnapshot.findFirst({
      where: { termId },
      include: {
        capturedBy: true,
      },
      orderBy: { capturedAt: 'desc' },
    });

    if (!snapshot) {
      throw new NotFoundException({
        code: ErrorCode.SNAPSHOT_NOT_FOUND,
        message: `Historical snapshot for term "${termId}" was not found`,
      });
    }

    const json = snapshot.snapshotJson as unknown as {
      metrics: {
        totalEvents: number;
        totalAttendance: number;
        totalCertificatesIssued: number;
        totalPassportsGenerated: number;
        totalTasksCompleted: number;
        totalTasksArchived: number;
        totalChecklistsSignedOff: number;
        totalAssetsApproved: number;
        activeMembersCount: number;
      };
      rosterSnapshot: {
        memberName: string;
        memberEmail: string;
        roleName: string;
        roleCode: string;
        committeeName: string | null;
        committeeCode: string | null;
      }[];
    };

    return {
      id: snapshot.id,
      termId: snapshot.termId,
      termCode: snapshot.termCode,
      termName: snapshot.termName,
      capturedAt: snapshot.capturedAt.toISOString(),
      capturedById: snapshot.capturedById,
      capturedByName: snapshot.capturedBy.name,
      metrics: json.metrics || {
        totalEvents: 0,
        totalAttendance: 0,
        totalCertificatesIssued: 0,
        totalPassportsGenerated: 0,
        totalTasksCompleted: 0,
        totalTasksArchived: 0,
        totalChecklistsSignedOff: 0,
        totalAssetsApproved: 0,
        activeMembersCount: 0,
      },
      rosterSnapshot: json.rosterSnapshot || [],
    };
  }

  private mapTerm(term: {
    id: string;
    name: string;
    code: string;
    startDate: Date;
    endDate: Date;
    status: string;
    isCurrent: boolean;
    archivedAt: Date | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: term.id,
      name: term.name,
      code: term.code,
      startDate: term.startDate.toISOString(),
      endDate: term.endDate.toISOString(),
      status: term.status as TermStatus,
      isCurrent: term.isCurrent,
      archivedAt: term.archivedAt ? term.archivedAt.toISOString() : null,
      createdById: term.createdById,
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    };
  }
}
