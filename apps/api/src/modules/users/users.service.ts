import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  UserQuery,
  UserSummary,
  UserDetail,
  UserStatus,
  PaginationMeta,
} from '@csi/shared';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: UserQuery): Promise<{ data: UserSummary[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const perPage = query.per_page || 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.UserWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { enrollmentNo: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.roleAssignments = {
        some: {
          role: { code: query.role },
          OR: [{ termEnd: null }, { termEnd: { gte: new Date() } }],
        },
      };
    }

    if (query.committee) {
      where.roleAssignments = {
        some: {
          committee: { code: query.committee },
          OR: [{ termEnd: null }, { termEnd: { gte: new Date() } }],
        },
      };
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const data: UserSummary[] = users.map((u) => ({
      id: u.id,
      enrollment_no: u.enrollmentNo,
      name: u.name,
      full_name: u.name,
      email: u.email,
      phone: u.phone,
      branch: u.branch,
      year: u.year,
      photo: u.photo,
      status: u.status as UserStatus,
      created_at: u.createdAt.toISOString(),
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

  async findById(id: string): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roleAssignments: {
          include: {
            role: true,
            committee: true,
          },
          orderBy: { termStart: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with id '${id}' not found`);
    }

    const now = new Date();
    const effectiveRoles = Array.from(
      new Set(
        user.roleAssignments
          .filter((ra) => !ra.termEnd || ra.termEnd >= now)
          .map((ra) => ra.role.code),
      ),
    );

    return {
      id: user.id,
      enrollment_no: user.enrollmentNo,
      name: user.name,
      full_name: user.name,
      email: user.email,
      phone: user.phone,
      branch: user.branch,
      year: user.year,
      photo: user.photo,
      status: user.status as UserStatus,
      created_at: user.createdAt.toISOString(),
      effective_roles: effectiveRoles,
      role_assignments: user.roleAssignments.map((ra) => ({
        id: ra.id,
        role_id: ra.roleId,
        role_code: ra.role.code,
        role_name: ra.role.name,
        committee_id: ra.committeeId,
        committee_code: ra.committee ? ra.committee.code : null,
        committee_name: ra.committee ? ra.committee.name : null,
        term_start: ra.termStart.toISOString(),
        term_end: ra.termEnd ? ra.termEnd.toISOString() : null,
      })),
    };
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    actorId?: string,
    reason?: string,
  ): Promise<UserSummary> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`User with id '${id}' not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { status },
      });

      // Write immutable audit log entry
      await tx.auditLog.create({
        data: {
          actorId: actorId || null,
          action: 'USER_STATUS_UPDATE',
          targetType: 'users',
          targetId: id,
          beforeJson: { status: existing.status },
          afterJson: { status, reason: reason || null },
        },
      });

      return user;
    });

    return {
      id: updated.id,
      enrollment_no: updated.enrollmentNo,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      branch: updated.branch,
      year: updated.year,
      photo: updated.photo,
      status: updated.status as UserStatus,
      created_at: updated.createdAt.toISOString(),
    };
  }
}

