import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PublicStatusResponse } from '@csi/shared';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<PublicStatusResponse> {
    const [activeMembersCount, totalEventsCount] = await Promise.all([
      this.prisma.user.count({
        where: { status: 'active' },
      }),
      this.prisma.event.count({
        where: { state: { in: ['published', 'registration_open', 'live', 'completed', 'certified'] } },
      }),
    ]);

    return {
      aggregates: {
        active_members: activeMembersCount,
        total_events: totalEventsCount,
        certificates_issued: 0,
      },
      membership_drive: {
        is_open: true,
        opens_at: '2026-07-15T00:00:00.000Z',
        closes_at: '2026-10-31T23:59:59.000Z',
        message: 'Annual student branch membership drive is currently open for GCET students.',
      },
    };
  }
}

