import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import {
  RecipientEligibilityMode,
  BatchRecipientInput,
} from '@csi/shared';

export interface ResolvedParticipant {
  recipientType: 'member' | 'guest';
  recipientId?: string;
  recipientEmail: string;
  recipientName: string;
  achievement?: string;
  collegeName?: string;
  customPlaceholders?: Record<string, string>;
}

@Injectable()
export class ParticipantResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves authoritative event participant records based on the chosen eligibility mode.
   */
  async resolveEligibleParticipants(
    eventId: string,
    eligibilityMode: RecipientEligibilityMode,
    explicitRecipients?: BatchRecipientInput[],
  ): Promise<ResolvedParticipant[]> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' was not found.`);
    }

    let participants: ResolvedParticipant[] = [];

    switch (eligibilityMode) {
      case RecipientEligibilityMode.VERIFIED_ATTENDANCE:
        participants = await this.resolveFromVerifiedAttendance(eventId, explicitRecipients);
        break;

      case RecipientEligibilityMode.ALL_REGISTERED:
        participants = await this.resolveFromAllRegistered(eventId, explicitRecipients);
        break;

      case RecipientEligibilityMode.EXPLICIT_SELECTION:
        participants = await this.resolveFromExplicitSelection(eventId, explicitRecipients);
        break;

      default:
        throw new BadRequestException(`Unsupported eligibility mode: ${eligibilityMode}`);
    }

    // Deduplicate by normalized email
    const seenEmails = new Set<string>();
    const deduplicated: ResolvedParticipant[] = [];

    for (const p of participants) {
      const normalized = p.recipientEmail.toLowerCase().trim();
      if (!seenEmails.has(normalized)) {
        seenEmails.add(normalized);
        deduplicated.push({
          ...p,
          recipientEmail: normalized,
        });
      }
    }

    return deduplicated;
  }

  /**
   * Resolves only participants who possess a verified attendance record for this event.
   */
  private async resolveFromVerifiedAttendance(
    eventId: string,
    explicitRecipients?: BatchRecipientInput[],
  ): Promise<ResolvedParticipant[]> {
    const attendanceRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        eventId,
        status: 'verified',
      },
    });

    if (attendanceRecords.length === 0) {
      return [];
    }

    const explicitMap = new Map<string, BatchRecipientInput>();
    if (explicitRecipients) {
      for (const r of explicitRecipients) {
        explicitMap.set(r.email.toLowerCase().trim(), r);
      }
    }

    const memberSubjectIds = attendanceRecords
      .filter((r) => r.subjectType === 'member')
      .map((r) => r.subjectId);

    const guestSubjectIds = attendanceRecords
      .filter((r) => r.subjectType === 'guest')
      .map((r) => r.subjectId);

    const users =
      memberSubjectIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: memberSubjectIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

    const guests =
      guestSubjectIds.length > 0
        ? await this.prisma.eventGuest.findMany({
            where: { id: { in: guestSubjectIds } },
            select: { id: true, name: true, email: true, college: true },
          })
        : [];

    const result: ResolvedParticipant[] = [];

    for (const u of users) {
      const normalizedEmail = u.email.toLowerCase().trim();
      const explicit = explicitMap.get(normalizedEmail);

      result.push({
        recipientType: 'member',
        recipientId: u.id,
        recipientEmail: normalizedEmail,
        recipientName: u.name,
        achievement: explicit?.achievement,
        collegeName: 'GCET Engineering College',
        customPlaceholders: explicit?.customPlaceholders,
      });
    }

    for (const g of guests) {
      const normalizedEmail = g.email.toLowerCase().trim();
      const explicit = explicitMap.get(normalizedEmail);

      result.push({
        recipientType: 'guest',
        recipientId: g.id,
        recipientEmail: normalizedEmail,
        recipientName: g.name,
        achievement: explicit?.achievement,
        collegeName: g.college || 'GCET Engineering College',
        customPlaceholders: explicit?.customPlaceholders,
      });
    }

    return result;
  }

  /**
   * Resolves all registered attendees (members and guests) for this event.
   */
  private async resolveFromAllRegistered(
    eventId: string,
    explicitRecipients?: BatchRecipientInput[],
  ): Promise<ResolvedParticipant[]> {
    const explicitMap = new Map<string, BatchRecipientInput>();
    if (explicitRecipients) {
      for (const r of explicitRecipients) {
        explicitMap.set(r.email.toLowerCase().trim(), r);
      }
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        eventId,
        status: 'registered',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const guests = await this.prisma.eventGuest.findMany({
      where: {
        eventId,
        status: 'registered',
      },
      select: { id: true, name: true, email: true, college: true },
    });

    const result: ResolvedParticipant[] = [];

    for (const reg of registrations) {
      const normalizedEmail = reg.user.email.toLowerCase().trim();
      const explicit = explicitMap.get(normalizedEmail);

      result.push({
        recipientType: 'member',
        recipientId: reg.user.id,
        recipientEmail: normalizedEmail,
        recipientName: reg.user.name,
        achievement: explicit?.achievement,
        collegeName: 'GCET Engineering College',
        customPlaceholders: explicit?.customPlaceholders,
      });
    }

    for (const g of guests) {
      const normalizedEmail = g.email.toLowerCase().trim();
      const explicit = explicitMap.get(normalizedEmail);

      result.push({
        recipientType: 'guest',
        recipientId: g.id,
        recipientEmail: normalizedEmail,
        recipientName: g.name,
        achievement: explicit?.achievement,
        collegeName: g.college || 'GCET Engineering College',
        customPlaceholders: explicit?.customPlaceholders,
      });
    }

    return result;
  }

  /**
   * Resolves explicit list of recipient items while checking authoritative database records.
   */
  private async resolveFromExplicitSelection(
    eventId: string,
    explicitRecipients?: BatchRecipientInput[],
  ): Promise<ResolvedParticipant[]> {
    if (!explicitRecipients || explicitRecipients.length === 0) {
      throw new BadRequestException('Explicit recipient list cannot be empty.');
    }

    const emails = explicitRecipients.map((r) => r.email.toLowerCase().trim());
    const userIds = explicitRecipients
      .map((r) => r.userId)
      .filter((id): id is string => Boolean(id));

    const dbUsers = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { in: emails } },
          { id: { in: userIds } },
        ],
      },
      select: { id: true, name: true, email: true },
    });

    const userEmailMap = new Map<string, { id: string; name: string; email: string }>();
    const userIdMap = new Map<string, { id: string; name: string; email: string }>();

    for (const u of dbUsers) {
      userEmailMap.set(u.email.toLowerCase().trim(), u);
      userIdMap.set(u.id, u);
    }

    const dbGuests = await this.prisma.eventGuest.findMany({
      where: {
        eventId,
        email: { in: emails },
      },
      select: { id: true, name: true, email: true, college: true },
    });

    const guestEmailMap = new Map<string, { id: string; name: string; email: string; college: string }>();
    for (const g of dbGuests) {
      guestEmailMap.set(g.email.toLowerCase().trim(), g);
    }

    const result: ResolvedParticipant[] = [];

    for (const r of explicitRecipients) {
      const normalizedEmail = r.email.toLowerCase().trim();
      const dbUser = (r.userId && userIdMap.get(r.userId)) || userEmailMap.get(normalizedEmail);
      const dbGuest = guestEmailMap.get(normalizedEmail);

      if (dbUser) {
        result.push({
          recipientType: 'member',
          recipientId: dbUser.id,
          recipientEmail: normalizedEmail,
          recipientName: dbUser.name,
          achievement: r.achievement,
          collegeName: 'GCET Engineering College',
          customPlaceholders: r.customPlaceholders,
        });
      } else if (dbGuest) {
        result.push({
          recipientType: 'guest',
          recipientId: dbGuest.id,
          recipientEmail: normalizedEmail,
          recipientName: dbGuest.name,
          achievement: r.achievement,
          collegeName: dbGuest.college || 'GCET Engineering College',
          customPlaceholders: r.customPlaceholders,
        });
      } else {
        // Fallback for verified guest/participant supplied in explicit list
        result.push({
          recipientType: 'guest',
          recipientEmail: normalizedEmail,
          recipientName: r.name || (normalizedEmail.split('@')[0] ?? 'Participant'),
          achievement: r.achievement,
          collegeName: 'GCET Engineering College',
          customPlaceholders: r.customPlaceholders,
        });
      }
    }

    return result;
  }
}
