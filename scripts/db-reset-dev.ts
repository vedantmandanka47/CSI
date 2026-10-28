/**
 * CSI GCET SB — Development Database Reset Utility (Section 4.4)
 * REFUSES to run unless the target database is strictly "csi_gcet_dev".
 * Resets schema and re-runs seed on the development database only.
 */

import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import dotenv from 'dotenv';

// Load environment from apps/api/.env
const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });

const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (!migrationUrl) {
  console.error('[FATAL] MIGRATION_DATABASE_URL is not defined in environment or apps/api/.env');
  process.exit(1);
}

// 1. Static URL verification
let parsedUrl: URL;
try {
  parsedUrl = new URL(migrationUrl);
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[FATAL] Failed to parse MIGRATION_DATABASE_URL:', message);
  process.exit(1);
}

const urlDatabaseName = parsedUrl.pathname.replace(/^\//, '');

if (urlDatabaseName !== 'csi_gcet_dev') {
  console.error('================================================================');
  console.error(' [REFUSED] SAFETY VIOLATION DETECTED!');
  console.error(` Target database in URL is "${urlDatabaseName}".`);
  console.error(' db:reset:dev is STRICTLY restricted to "csi_gcet_dev" only.');
  console.error('================================================================');
  process.exit(1);
}

async function main() {
  console.log('================================================================');
  console.log(' CSI GCET SB — Database Reset (csi_gcet_dev only)');
  console.log(' Verifying connection and safety boundaries...');
  console.log('================================================================\n');

  // 2. Live database query verification
  const client = new Client({ connectionString: migrationUrl });
  try {
    await client.connect();
    const result = await client.query<{ current_database: string }>('SELECT current_database();');
    const liveDbName = result.rows[0]?.current_database;

    if (liveDbName !== 'csi_gcet_dev') {
      console.error('================================================================');
      console.error(' [REFUSED] LIVE SAFETY VIOLATION DETECTED!');
      console.error(` Connected server reports current_database() = "${liveDbName}".`);
      console.error(' db:reset:dev is STRICTLY restricted to "csi_gcet_dev" only.');
      console.error('================================================================');
      await client.end();
      process.exit(1);
    }

    console.log(`[VERIFIED] Connected to confirmed dev database: "${liveDbName}".`);
    await client.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[FATAL] Failed to connect to database for verification:', message);
    try {
      await client.end();
    } catch {
      // ignore
    }
    process.exit(1);
  }

  // 3. Execute prisma migrate reset
  console.log('\nExecuting Prisma migration reset and seed for csi_gcet_dev...\n');
  const apiDir = resolve(join('apps', 'api'));
  execSync('npx prisma migrate reset --force', {
    cwd: apiDir,
    stdio: 'inherit',
    env: process.env
  });

  console.log('\n[SUCCESS] csi_gcet_dev reset and re-seeded successfully.');
}

main().catch((err) => {
  console.error('[FATAL] Unexpected error during db-reset-dev:', err);
  process.exit(1);
});
