import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import {
  MemberApplicationQuery,
  MemberApplicationDetail,
  ErrorCode,
  RoleCode,
  UserStatus,
} from '@csi/shared';

@Injectable()
export class MemberAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List student membership applications with pagination, status filters, and search.
   */
  async listApplications(query: MemberApplicationQuery): Promise<{
    data: MemberApplicationDetail[];
    meta: { page: number; per_page: number; total: number; total_pages: number };
  }> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.UserWhereInput = {};

    if (query.status && query.status !== 'all') {
      where.status = query.status;
    } else if (!query.status) {
      where.status = UserStatus.PENDING;
    }

    if (query.branch) {
      where.branch = query.branch;
    }

    if (query.year) {
      where.year = query.year;
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { enrollmentNo: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Check roster status for these applications
    const enrollmentNumbers = users
      .map((u) => u.enrollmentNo)
      .filter((eno): eno is string => Boolean(eno));

    const rosterMatches = await this.prisma.rosterEntry.findMany({
      where: { enrollmentNo: { in: enrollmentNumbers } },
      select: { enrollmentNo: true },
    });
    const rosterSet = new Set(rosterMatches.map((r) => r.enrollmentNo.toLowerCase()));

    const data: MemberApplicationDetail[] = users.map((user) => ({
      id: user.id,
      enrollment_no: user.enrollmentNo,
      name: user.name,
      email: user.email,
      phone: user.phone,
      branch: user.branch,
      year: user.year,
      status: user.status,
      is_on_roster: user.enrollmentNo ? rosterSet.has(user.enrollmentNo.toLowerCase()) : false,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    }));

    return {
      data,
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: Math.ceil(total / perPage),
      },
    };
  }

  /**
   * Approve student membership application.
   * Transactionally promotes status from 'pending' to 'active', grants 'member' role, and writes audit record.
   */
  async approveApplication(userId: string, actorId: string): Promise<MemberApplicationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Student application not found.',
        });
      }

      if (user.status !== UserStatus.PENDING) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: `Cannot approve application with current status "${user.status}".`,
        });
      }

      // 1. Update user to active
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.ACTIVE },
      });

      // 2. Assign 'member' role if not already assigned
      const memberRole = await tx.role.findUnique({
        where: { code: RoleCode.MEMBER },
      });

      if (memberRole) {
        const existingAssignment = await tx.roleAssignment.findFirst({
          where: { userId, roleId: memberRole.id },
        });

        if (!existingAssignment) {
          const oneYearAhead = new Date();
          oneYearAhead.setFullYear(oneYearAhead.getFullYear() + 1);

          await tx.roleAssignment.create({
            data: {
              userId,
              roleId: memberRole.id,
              termStart: new Date(),
              termEnd: oneYearAhead,
            },
          });
        }
      }

      // 3. Write immutable audit log
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'MEMBER_APPLICATION_APPROVED',
          targetType: 'user',
          targetId: userId,
          beforeJson: { status: UserStatus.PENDING },
          afterJson: {
            status: UserStatus.ACTIVE,
            enrollment_no: user.enrollmentNo,
            approved_by: actorId,
          },
        },
      });

      return {
        id: updatedUser.id,
        enrollment_no: updatedUser.enrollmentNo,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        branch: updatedUser.branch,
        year: updatedUser.year,
        status: updatedUser.status,
        is_on_roster: true,
        created_at: updatedUser.createdAt.toISOString(),
        updated_at: updatedUser.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Reject student membership application with logged reason.
   */
  async rejectApplication(
    userId: string,
    reason: string | undefined,
    actorId: string,
  ): Promise<MemberApplicationDetail> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Student application not found.',
        });
      }

      if (user.status !== UserStatus.PENDING) {
        throw new BadRequestException({
          code: ErrorCode.CONFLICT,
          message: `Cannot reject application with status "${user.status}".`,
        });
      }

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { status: UserStatus.INACTIVE },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: 'MEMBER_APPLICATION_REJECTED',
          targetType: 'user',
          targetId: userId,
          beforeJson: { status: UserStatus.PENDING },
          afterJson: {
            status: UserStatus.INACTIVE,
            reason: reason || 'Not specified',
            rejected_by: actorId,
          },
        },
      });

      return {
        id: updatedUser.id,
        enrollment_no: updatedUser.enrollmentNo,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        branch: updatedUser.branch,
        year: updatedUser.year,
        status: updatedUser.status,
        is_on_roster: false,
        created_at: updatedUser.createdAt.toISOString(),
        updated_at: updatedUser.updatedAt.toISOString(),
      };
    });
  }
}
