import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface RetentionPurgeSummary {
  sessionsPurged: number;
  tokensPurged: number;
  idempotencyKeysPurged: number;
  guestsAnonymized: number;
  executedAt: string;
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Purges expired sessions from the database.
   */
  async purgeExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    this.logger.log(`Purged ${result.count} expired user sessions.`);
    return result.count;
  }

  /**
   * Purges expired verification tokens and password reset tokens.
   */
  async purgeExpiredTokens(): Promise<number> {
    const now = new Date();
    const [verificationTokens, passwordTokens] = await Promise.all([
      this.prisma.verificationToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);
    const total = verificationTokens.count + passwordTokens.count;
    this.logger.log(`Purged ${total} expired verification and password reset tokens.`);
    return total;
  }

  /**
   * Purges expired idempotency keys.
   */
  async purgeExpiredIdempotencyKeys(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    this.logger.log(`Purged ${result.count} expired idempotency keys.`);
    return result.count;
  }

  /**
   * Anonymizes guest registrations for concluded events exceeding retention window.
   * Under India DPDP Act 2023, personal data must not be stored once the processing purpose concludes.
   */
  async anonymizeConcludedEventGuests(guestRetentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - guestRetentionDays * 24 * 60 * 60 * 1000);

    const concludedEvents = await this.prisma.event.findMany({
      where: {
        endsAt: { lt: cutoffDate },
      },
      select: { id: true },
    });

    if (concludedEvents.length === 0) {
      return 0;
    }

    const eventIds = concludedEvents.map((e) => e.id);

    const guestRecords = await this.prisma.eventGuest.findMany({
      where: {
        eventId: { in: eventIds },
        status: { not: 'anonymized' },
      },
      select: { id: true },
    });

    let anonymizedCount = 0;
    for (const guest of guestRecords) {
      await this.prisma.eventGuest.update({
        where: { id: guest.id },
        data: {
          name: 'Anonymized Guest',
          email: `anonymized-${guest.id}@anonymized.local`,
          college: 'Anonymized',
          phone: '0000000000',
          status: 'anonymized',
        },
      });
      anonymizedCount++;
    }

    this.logger.log(`Anonymized ${anonymizedCount} guest attendee records for concluded events.`);
    return anonymizedCount;
  }

  /**
   * Executes full retention lifecycle purge and logs immutable audit trail.
   */
  async runRetentionPurge(actorId?: string, guestRetentionDays: number = 90): Promise<RetentionPurgeSummary> {
    const now = new Date();

    const [sessionsPurged, tokensPurged, idempotencyKeysPurged, guestsAnonymized] = await Promise.all([
      this.purgeExpiredSessions(),
      this.purgeExpiredTokens(),
      this.purgeExpiredIdempotencyKeys(),
      this.anonymizeConcludedEventGuests(guestRetentionDays),
    ]);

    const summary: RetentionPurgeSummary = {
      sessionsPurged,
      tokensPurged,
      idempotencyKeysPurged,
      guestsAnonymized,
      executedAt: now.toISOString(),
    };

    await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        action: 'RETENTION_PURGE_EXECUTED',
        targetType: 'system',
        targetId: null,
        afterJson: summary as unknown as Prisma.InputJsonValue,
      },
    });

    return summary;
  }
}
