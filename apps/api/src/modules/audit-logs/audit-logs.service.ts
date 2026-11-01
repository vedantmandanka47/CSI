import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditLogQuery, AuditLogResponse, AuditLogEntry } from '@csi/shared';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AuditLogQuery): Promise<AuditLogResponse> {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const skip = (page - 1) * perPage;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) {
      where.action = { equals: query.action };
    }

    if (query.actor_id) {
      where.actorId = { equals: query.actor_id };
    }

    if (query.target_type) {
      where.targetType = { equals: query.target_type };
    }

    if (query.target_id) {
      where.targetId = { equals: query.target_id };
    }

    if (query.from_date || query.to_date) {
      where.createdAt = {
        gte: query.from_date ? new Date(query.from_date) : undefined,
        lte: query.to_date ? new Date(query.to_date) : undefined,
      };
    }

    const [total, records] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const data: AuditLogEntry[] = records.map((r) => ({
      id: r.id,
      actor_id: r.actorId,
      action: r.action,
      target_type: r.targetType,
      target_id: r.targetId,
      before_json: r.beforeJson,
      after_json: r.afterJson,
      ip: r.createdAt < ninetyDaysAgo ? '[ANONYMIZED]' : r.ip,
      created_at: r.createdAt.toISOString(),
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
}

