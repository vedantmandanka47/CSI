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

/**
 * Strict validation for GUEST_RETENTION_DAYS configuration (AUD-OPS-01 / Finding 2.5).
 * Must be a positive integer between 1 and 3650 days.
 * Rejects empty strings, decimals, negatives, zeroes, non-numeric strings, and strings with arbitrary text prefixes/suffixes (e.g., '90days').
 */
export function validateGuestRetentionDays(rawRetention: string | undefined): number {
  if (rawRetention === undefined || rawRetention === null) {
    return 90; // Default when not specified
  }

  const trimmed = rawRetention.trim();
  if (trimmed.length === 0) {
    throw new Error('GUEST_RETENTION_DAYS cannot be empty or whitespace.');
  }

  // Strictly match positive integers without decimals or non-digit characters
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error(
      `GUEST_RETENTION_DAYS must be a strictly positive whole integer (no decimals, units, leading zeros, or trailing text). Received: "${rawRetention}"`,
    );
  }

  const days = Number(trimmed);
  if (!Number.isSafeInteger(days)) {
    throw new Error(`GUEST_RETENTION_DAYS value "${rawRetention}" exceeds safe integer range.`);
  }

  if (days < 1 || days > 3650) {
    throw new Error(
      `GUEST_RETENTION_DAYS must be between 1 and 3650 days (approx. 10 years). Received: ${days}`,
    );
  }

  return days;
}

async function main() {
  const rawRetention = process.env.GUEST_RETENTION_DAYS;
  let guestRetentionDays: number;
  try {
    guestRetentionDays = validateGuestRetentionDays(rawRetention);
  } catch (err: unknown) {
    console.error(`[FATAL] Configuration validation error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

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

if (require.main === module) {
  main();
}
