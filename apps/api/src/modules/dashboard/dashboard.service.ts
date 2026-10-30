import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  MemberDashboardData,
  ErrorCode,
  DashboardActivityItem,
  DashboardUpcomingEvent,
  DashboardPastRegistration,
} from '@csi/shared';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve the authenticated member's self-service dashboard data.
   */
  async getMemberDashboard(userId: string): Promise<MemberDashboardData> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Member record not found.',
      });
    }

    // Term validity
    const validUntil = new Date(user.createdAt);
    validUntil.setFullYear(validUntil.getFullYear() + 1);

    const roles = user.roleAssignments.map((ra) => ra.role.code);
    if (!roles.includes('member')) {
      roles.push('member');
    }

    // 1. Fetch member event registrations
    const registrations = await this.prisma.registration.findMany({
      where: { userId },
      include: {
        event: {
          include: { venue: true },
        },
      },
      orderBy: { event: { startsAt: 'desc' } },
    });

    // 2. Fetch member attendance records
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        subjectId: userId,
        status: 'verified',
      },
      include: {
        event: true,
        session: true,
      },
      orderBy: { verifiedAt: 'desc' },
    });

    const attendedEventIds = new Set(attendanceRecords.map((ar) => ar.eventId));
    const now = new Date();

    const upcomingEvents: DashboardUpcomingEvent[] = [];
    const pastRegistrations: DashboardPastRegistration[] = [];
    const activityItems: DashboardActivityItem[] = [];

    // Categorize registrations
    for (const reg of registrations) {
      const isPast = new Date(reg.event.startsAt) <= now;

      if (!isPast) {
        upcomingEvents.push({
          registration_id: reg.id,
          event_id: reg.eventId,
          slug: reg.event.slug,
          title: reg.event.title,
          category: reg.event.category,
          starts_at: reg.event.startsAt.toISOString(),
          ends_at: reg.event.endsAt.toISOString(),
          venue_name: reg.event.venue?.name ?? null,
          status: reg.status,
        });
      } else {
        const wasAttended = attendedEventIds.has(reg.eventId) || reg.status === 'attended';
        pastRegistrations.push({
          registration_id: reg.id,
          event_id: reg.eventId,
          slug: reg.event.slug,
          title: reg.event.title,
          starts_at: reg.event.startsAt.toISOString(),
          registered_at: reg.registeredAt.toISOString(),
          attendance_status: wasAttended ? 'attended' : 'absent',
        });
      }

      // Add registration to activity timeline
      activityItems.push({
        id: `reg-${reg.id}`,
        type: 'registration',
        title: `Registered for ${reg.event.title}`,
        description: `Confirmed seat in ${reg.event.category.toUpperCase()} category`,
        timestamp: reg.registeredAt.toISOString(),
      });
    }

    // Add attendance check-ins to activity timeline
    for (const ar of attendanceRecords) {
      activityItems.push({
        id: `att-${ar.id}`,
        type: 'attendance',
        title: `Checked in at ${ar.event.title}`,
        description: `Verified attendance via ${ar.method.toUpperCase()} for "${ar.session.name}"`,
        timestamp: ar.verifiedAt.toISOString(),
      });
    }

    // Add account membership creation
    activityItems.push({
      id: `mem-${user.id}`,
      type: 'membership',
      title: 'Joined CSI GCET Student Branch',
      description: 'Official student branch membership initialized',
      timestamp: user.createdAt.toISOString(),
    });

    // Sort timeline descending
    activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate verified statistics
    const totalRegistered = registrations.length;
    const totalAttended = attendedEventIds.size;
    const attendancePercentage =
      totalRegistered > 0 ? Math.round((totalAttended / totalRegistered) * 100) : 0;

    return {
      profile: {
        id: user.id,
        name: user.name,
        enrollment_no: user.enrollmentNo,
        email: user.email,
        branch: user.branch,
        year: user.year,
        status: user.status,
        roles,
        valid_until: validUntil.toISOString(),
      },
      statistics: {
        total_registered_events: totalRegistered,
        attended_events_count: totalAttended,
        attendance_percentage: attendancePercentage,
        certificates_count: 0,
      },
      upcoming_events: upcomingEvents,
      past_registrations: pastRegistrations,
      recent_activity: activityItems.slice(0, 10),
    };
  }
}

