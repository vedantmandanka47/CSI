import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  CreateAcademicTermInput,
  UpdateAcademicTermInput,
  AcademicTermResponse,
  AcademicTermListResponse,
  TermStatus,
  ErrorCode,
} from '@csi/shared';

@Injectable()
export class TermsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new academic term
   */
  async createTerm(
    actorId: string,
    data: CreateAcademicTermInput,
  ): Promise<AcademicTermResponse> {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException({
        code: ErrorCode.TERM_INVALID_DATES,
        message: 'Start date must be strictly before end date',
      });
    }

    // Check if term code already exists
    const existing = await this.prisma.academicTerm.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new ConflictException({
        code: ErrorCode.TERM_ALREADY_EXISTS,
        message: `An academic term with code "${data.code}" already exists`,
      });
    }

    const term = await this.prisma.academicTerm.create({
      data: {
        name: data.name,
        code: data.code,
        startDate,
        endDate,
        status: TermStatus.DRAFT,
        isCurrent: false,
        createdById: actorId,
      },
    });

    // Record audit log
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'term.created',
        targetType: 'academic_term',
        targetId: term.id,
        afterJson: {
          code: term.code,
          name: term.name,
          startDate: term.startDate.toISOString(),
          endDate: term.endDate.toISOString(),
          status: term.status,
        },
      },
    });

    return this.mapTermResponse(term);
  }

  /**
   * List all academic terms with counts
   */
  async getTerms(): Promise<AcademicTermListResponse> {
    const terms = await this.prisma.academicTerm.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: {
            snapshots: true,
          },
        },
      },
    });

    const now = new Date();

    const termsWithCounts = await Promise.all(
      terms.map(async (t) => {
        // Count active role assignments within term dates
        const activeAppointmentsCount = await this.prisma.roleAssignment.count({
          where: {
            termStart: { lte: t.endDate },
            OR: [{ termEnd: null }, { termEnd: { gte: t.startDate } }],
          },
        });

        // Count events whose startsAt falls within term dates
        const eventsCount = await this.prisma.event.count({
          where: {
            startsAt: {
              gte: t.startDate,
              lte: t.endDate,
            },
          },
        });

        return {
          ...this.mapTermResponse(t),
          activeAppointmentsCount,
          eventsCount,
        };
      }),
    );

    const currentTerm =
      termsWithCounts.find((t) => t.isCurrent) ||
      termsWithCounts.find(
        (t) =>
          t.status === TermStatus.ACTIVE &&
          new Date(t.startDate) <= now &&
          new Date(t.endDate) >= now,
      ) ||
      null;

    return {
      data: termsWithCounts,
      currentTerm,
    };
  }

  /**
   * Get a single academic term by ID
   */
  async getTermById(id: string): Promise<AcademicTermResponse> {
    const term = await this.prisma.academicTerm.findUnique({
      where: { id },
    });

    if (!term) {
      throw new NotFoundException({
        code: ErrorCode.TERM_NOT_FOUND,
        message: `Academic term "${id}" was not found`,
      });
    }

    const activeAppointmentsCount = await this.prisma.roleAssignment.count({
      where: {
        termStart: { lte: term.endDate },
        OR: [{ termEnd: null }, { termEnd: { gte: term.startDate } }],
      },
    });

    const eventsCount = await this.prisma.event.count({
      where: {
        startsAt: {
          gte: term.startDate,
          lte: term.endDate,
        },
      },
    });

    return {
      ...this.mapTermResponse(term),
      activeAppointmentsCount,
      eventsCount,
    };
  }

  /**
   * Update an academic term
   */
  async updateTerm(
    actorId: string,
    id: string,
    data: UpdateAcademicTermInput,
  ): Promise<AcademicTermResponse> {
    const term = await this.prisma.academicTerm.findUnique({
      where: { id },
    });

    if (!term) {
      throw new NotFoundException({
        code: ErrorCode.TERM_NOT_FOUND,
        message: `Academic term "${id}" was not found`,
      });
    }

    const startDate = data.startDate ? new Date(data.startDate) : term.startDate;
    const endDate = data.endDate ? new Date(data.endDate) : term.endDate;

    if (startDate >= endDate) {
      throw new BadRequestException({
        code: ErrorCode.TERM_INVALID_DATES,
        message: 'Start date must be strictly before end date',
      });
    }

    const updated = await this.prisma.academicTerm.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.startDate ? { startDate } : {}),
        ...(data.endDate ? { endDate } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'term.updated',
        targetType: 'academic_term',
        targetId: id,
        beforeJson: {
          name: term.name,
          startDate: term.startDate.toISOString(),
          endDate: term.endDate.toISOString(),
          status: term.status,
        },
        afterJson: {
          name: updated.name,
          startDate: updated.startDate.toISOString(),
          endDate: updated.endDate.toISOString(),
          status: updated.status,
        },
      },
    });

    return this.mapTermResponse(updated);
  }

  /**
   * Delete a draft academic term
   */
  async deleteTerm(actorId: string, id: string): Promise<{ success: boolean }> {
    const term = await this.prisma.academicTerm.findUnique({
      where: { id },
    });

    if (!term) {
      throw new NotFoundException({
        code: ErrorCode.TERM_NOT_FOUND,
        message: `Academic term "${id}" was not found`,
      });
    }

    if (term.isCurrent || term.status === TermStatus.ACTIVE) {
      throw new BadRequestException({
        code: ErrorCode.TERM_CANNOT_DELETE_ACTIVE,
        message: 'Active or current academic terms cannot be deleted',
      });
    }

    await this.prisma.academicTerm.delete({
      where: { id },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'term.deleted',
        targetType: 'academic_term',
        targetId: id,
        beforeJson: {
          code: term.code,
          name: term.name,
        },
      },
    });

    return { success: true };
  }

  private mapTermResponse(term: {
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
  }): AcademicTermResponse {
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
