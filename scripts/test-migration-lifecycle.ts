import { readFileSync } from 'fs';
import { resolve } from 'path';
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

  const migrationDir = resolve(
    process.cwd(),
    'apps/api/prisma/migrations/20261028000000_init_foundation',
  );
  const upSql = readFileSync(resolve(migrationDir, 'migration.sql'), 'utf-8');
  const downSql = readFileSync(resolve(migrationDir, 'down.sql'), 'utf-8');

  try {
    // ------------------------------------------------------------------------
    // STEP 1: UP (Initial Migration)
    // ------------------------------------------------------------------------
    console.log('\n--- [1/3] Applying UP Migration ---');
    await client.query(upSql);
    console.log('✅ UP migration executed successfully.');

    // Verify tables exist
    const checkTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('roles', 'committees', 'audit_log');
    `;
    const upTables = await client.query(checkTablesQuery);
    console.log(
      `📊 Tables present after UP: ${upTables.rows.map((r: { table_name: string }) => r.table_name).join(', ')}`,
    );
    if (upTables.rows.length !== 3) {
      throw new Error(`Expected 3 tables after UP migration, found ${upTables.rows.length}`);
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
    // STEP 2: DOWN (Rollback)
    // ------------------------------------------------------------------------
    console.log('\n--- [2/3] Applying DOWN Rollback (down.sql) ---');
    await client.query(downSql);
    console.log('✅ DOWN rollback executed successfully.');

    const downTables = await client.query(checkTablesQuery);
    console.log(`📊 Tables present after DOWN: ${downTables.rows.length}`);
    if (downTables.rows.length !== 0) {
      throw new Error(`Expected 0 tables after DOWN rollback, found ${downTables.rows.length}`);
    }

    // ------------------------------------------------------------------------
    // STEP 3: UP (Re-apply migration)
    // ------------------------------------------------------------------------
    console.log('\n--- [3/3] Re-applying UP Migration ---');
    await client.query(upSql);
    console.log('✅ UP migration re-applied cleanly.');

    const finalTables = await client.query(checkTablesQuery);
    if (finalTables.rows.length !== 3) {
      throw new Error(`Expected 3 tables after re-applying UP, found ${finalTables.rows.length}`);
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
