import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PublicStatusResponse } from '@csi/shared';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(): Promise<PublicStatusResponse> {
    const [activeMembersCount, totalEventsCount, driveWindow] = await Promise.all([
      this.prisma.user.count({
        where: { status: 'active' },
      }),
      this.prisma.event.count({
        where: { state: { in: ['published', 'registration_open', 'live', 'completed', 'certified'] } },
      }),
      this.prisma.driveWindow.findUnique({
        where: { type: 'membership' },
      }),
    ]);

    const now = new Date();
    const isOpen = driveWindow
      ? driveWindow.isOpen && driveWindow.opensAt <= now && driveWindow.closesAt >= now
      : false;

    let message = 'Annual student branch membership recruitment drive is currently closed.';
    if (isOpen && driveWindow) {
      const closesFormatted = driveWindow.closesAt.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      message = `Annual student branch membership drive is currently open until ${closesFormatted}.`;
    }

    return {
      aggregates: {
        active_members: activeMembersCount,
        total_events: totalEventsCount,
        certificates_issued: 0,
      },
      membership_drive: {
        is_open: isOpen,
        opens_at: driveWindow?.opensAt.toISOString() || null,
        closes_at: driveWindow?.closesAt.toISOString() || null,
        message,
      },
    };
  }
}

