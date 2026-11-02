#!/usr/bin/env tsx
/**
 * CSI GCET SB — Automated DPDP Data Retention & Purge Runner (AUD-OPS-01)
 *
 * Can be executed interactively or scheduled via Windows Task Scheduler / Linux crontab:
 *   0 2 * * * cd /path/to/csi-gcet-sb && npm run maintenance:retention-purge
 */

import { resolve, join } from 'node:path';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables from apps/api/.env if available
const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });
dotenv.config();

async function main() {
  const prisma = new PrismaClient();
  const rawRetention = process.env.GUEST_RETENTION_DAYS;
  const guestRetentionDays = rawRetention !== undefined ? parseInt(rawRetention, 10) : 90;

  if (Number.isNaN(guestRetentionDays) || guestRetentionDays < 1 || guestRetentionDays > 3650) {
    console.error(
      `[FATAL] GUEST_RETENTION_DAYS must be a valid positive integer between 1 and 3650 days. Received: "${rawRetention}"`,
    );
    process.exit(1);
  }

  console.log('================================================================');
  console.log(' CSI GCET SB — DPDP Retention Purge & Anonymization Routine');
  console.log(` Executed at: ${new Date().toISOString()}`);
  console.log(` Guest retention window: ${guestRetentionDays} days`);
  console.log('================================================================\n');

  try {
    const now = new Date();

    // 1. Purge expired sessions
    const sessions = await prisma.session.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    console.log(`[PASS] Purged ${sessions.count} expired sessions.`);

    // 2. Purge expired verification tokens
    const verifTokens = await prisma.verificationToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const pwdTokens = await prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    console.log(`[PASS] Purged ${verifTokens.count + pwdTokens.count} expired tokens.`);

    // 3. Purge expired idempotency keys
    const idempotency = await prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    console.log(`[PASS] Purged ${idempotency.count} expired idempotency keys.`);

    // 4. Anonymize concluded event guests
    const cutoffDate = new Date(Date.now() - guestRetentionDays * 24 * 60 * 60 * 1000);
    const concludedEvents = await prisma.event.findMany({
      where: { endsAt: { lt: cutoffDate } },
      select: { id: true },
    });

    let anonymizedCount = 0;
    if (concludedEvents.length > 0) {
      const eventIds = concludedEvents.map((e) => e.id);
      // Atomic batch update avoiding N+1 queries while maintaining unique constraint on (event_id, email)
      const updateResult = await prisma.$executeRawUnsafe(
        `UPDATE "event_guests"
         SET "name" = 'Anonymized Guest',
             "email" = 'anonymized-' || "id"::text || '@anonymized.local',
             "college" = 'Anonymized',
             "phone" = '0000000000',
             "status" = 'anonymized',
             "updated_at" = NOW()
         WHERE "event_id" = ANY($1::uuid[]) AND "status" != 'anonymized';`,
        eventIds,
      );
      anonymizedCount = updateResult;
    }
    console.log(`[PASS] Anonymized ${anonymizedCount} guest registrations.`);

    // 5. Record audit trail
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'DPDP_RETENTION_PURGE',
        targetType: 'system_retention',
        targetId: null,
        afterJson: {
          trigger: 'system_cron',
          sessionsPurged: sessions.count,
          tokensPurged: verifTokens.count + pwdTokens.count,
          idempotencyKeysPurged: idempotency.count,
          guestsAnonymized: anonymizedCount,
          guestRetentionDays,
          executedAt: now.toISOString(),
        },
      },
    });
    console.log('[PASS] Audit log entry recorded successfully.');
    console.log('\n[SUCCESS] Retention purge completed without errors.');
  } catch (err) {
    console.error('[FATAL] Retention purge failed:', (err as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
