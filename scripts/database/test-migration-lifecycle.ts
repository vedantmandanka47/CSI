import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { Client } from 'pg';

// Test database connection string using migrator role
const testDbUrl =
  process.env.MIGRATION_DATABASE_URL ||
  'postgresql://csi_migrator:<choose-locally>@localhost:5432/csi_gcet_test';

async function runMigrationTest() {
  console.log('🧪 Starting Migration Lifecycle Test (INT-11: UP -> DOWN -> UP)...');
  console.log(`📡 Connecting to test database: csi_gcet_test`);

  const client = new Client({ connectionString: testDbUrl });
  await client.connect();

  // Strict fail-closed target verification (U1 / Finding F-01)
  const dbCheck = await client.query<{ current_database: string }>('SELECT current_database();');
  const liveDbName = dbCheck.rows[0]?.current_database;
  if (liveDbName !== 'csi_gcet_test') {
    throw new Error(
      `[SAFETY FATAL] Migration lifecycle test refuses to run against "${liveDbName}". Target MUST be strictly "csi_gcet_test". Aborting before executing any SQL.`,
    );
  }
  console.log(`🔒 [VERIFIED] Live database verified as "${liveDbName}".`);

  const migrationsRoot = resolve(process.cwd(), 'apps/api/prisma/migrations');
  const migrationDirs = readdirSync(migrationsRoot)
    .filter((name) => statSync(join(migrationsRoot, name)).isDirectory())
    .sort();

  console.log(`Found ${migrationDirs.length} migration(s): ${migrationDirs.join(', ')}`);

  const expectedTables = [
    'roles',
    'committees',
    'audit_log',
    'users',
    'roster_entries',
    'role_assignments',
    'sessions',
    'verification_tokens',
    'password_reset_tokens',
    'venues',
    'events',
    'registrations',
    'event_guests',
    'drive_windows',
    'attendance_sessions',
    'attendance_records',
    'idempotency_keys',
    'certificate_batches',
    'certificates',
    'passports',
  ];

  try {
    // ------------------------------------------------------------------------
    // STEP 0: Pre-clean test database if previous run left tables behind
    // ------------------------------------------------------------------------
    const preCheck = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1);`,
      [expectedTables],
    );
    if (preCheck.rows.length > 0) {
      console.log('🧹 Pre-cleaning test database from previous run...');
      const reverseDirs = [...migrationDirs].reverse();
      for (const dirName of reverseDirs) {
        const downPath = join(migrationsRoot, dirName, 'down.sql');
        const downSql = readFileSync(downPath, 'utf-8');
        await client.query(downSql);
      }
      console.log('✅ Pre-clean completed.');
    }

    // ------------------------------------------------------------------------
    // STEP 1: UP (Apply all migrations in forward order)
    // ------------------------------------------------------------------------
    console.log('\n--- [1/3] Applying all UP Migrations ---');
    for (const dirName of migrationDirs) {
      const upSql = readFileSync(join(migrationsRoot, dirName, 'migration.sql'), 'utf-8');
      console.log(`  Applying UP: ${dirName}`);
      await client.query(upSql);
    }
    console.log('✅ All UP migrations executed successfully.');

    // Verify tables exist
    const checkTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = ANY($1);
    `;
    const upTables = await client.query(checkTablesQuery, [expectedTables]);
    console.log(
      `📊 Tables present after UP: ${upTables.rows.map((r: { table_name: string }) => r.table_name).join(', ')}`,
    );
    if (upTables.rows.length !== expectedTables.length) {
      throw new Error(
        `Expected ${expectedTables.length} tables after UP migration, found ${upTables.rows.length}`,
      );
    }

    // Verify append-only audit_log trigger (INT-01)
    console.log('🔒 Verifying audit_log append-only trigger constraint...');
    const insertAudit = await client.query(`
      INSERT INTO "audit_log" (action, ip) VALUES ('TEST_ACTION', '127.0.0.1') RETURNING id;
    `);
    const auditId = insertAudit.rows[0].id;

    let triggerBlockedUpdate = false;
    try {
      await client.query(`UPDATE "audit_log" SET action = 'TAMPERED' WHERE id = $1`, [auditId]);
    } catch (err: unknown) {
      triggerBlockedUpdate = true;
      console.log(`✅ Append-only trigger successfully blocked UPDATE: ${(err as Error).message}`);
    }

    if (!triggerBlockedUpdate) {
      throw new Error(
        'FAILED: audit_log allowed UPDATE operation! Trigger not enforcing immutability.',
      );
    }

    // ------------------------------------------------------------------------
    // STEP 2: DOWN (Rollback all migrations in reverse order)
    // ------------------------------------------------------------------------
    console.log('\n--- [2/3] Applying DOWN Rollbacks in reverse order ---');
    const reverseDirs = [...migrationDirs].reverse();
    for (const dirName of reverseDirs) {
      const downPath = join(migrationsRoot, dirName, 'down.sql');
      const downSql = readFileSync(downPath, 'utf-8');
      console.log(`  Applying DOWN: ${dirName}`);
      await client.query(downSql);
    }
    console.log('✅ DOWN rollbacks executed successfully.');

    const downTables = await client.query(checkTablesQuery, [expectedTables]);
    console.log(`📊 Tables present after DOWN: ${downTables.rows.length}`);
    if (downTables.rows.length !== 0) {
      throw new Error(`Expected 0 tables after DOWN rollback, found ${downTables.rows.length}`);
    }

    // ------------------------------------------------------------------------
    // STEP 3: UP (Re-apply all migrations forward)
    // ------------------------------------------------------------------------
    console.log('\n--- [3/3] Re-applying all UP Migrations ---');
    for (const dirName of migrationDirs) {
      const upSql = readFileSync(join(migrationsRoot, dirName, 'migration.sql'), 'utf-8');
      console.log(`  Re-applying UP: ${dirName}`);
      await client.query(upSql);
    }
    console.log('✅ UP migrations re-applied cleanly.');

    const finalTables = await client.query(checkTablesQuery, [expectedTables]);
    if (finalTables.rows.length !== expectedTables.length) {
      throw new Error(
        `Expected ${expectedTables.length} tables after re-applying UP, found ${finalTables.rows.length}`,
      );
    }

    console.log('\n🎉 Migration lifecycle test PASSED! UP -> DOWN -> UP verified.');
  } finally {
    await client.end();
  }
}

runMigrationTest().catch((err) => {
  console.error('\n❌ Migration lifecycle test FAILED:', err);
  process.exit(1);
});
