import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { Client } from 'pg';

// Test database connection string using migrator role
const testDbUrl =
  process.env.MIGRATION_DATABASE_URL ||
  'postgresql://csi_migrator:<choose-locally>@localhost:5432/csi_gcet_test';

interface PermissionSnapshot {
  hasSchemaUsage: boolean;
  tableGrantsCount: number;
  sequenceGrantsCount: number;
  hasSequenceUsage: boolean;
  hasSequenceSelect: boolean;
  defaultAclCount: number;
  tableGrants: Array<{ table_name: string; privilege_type: string }>;
}

async function inspectRuntimePermissions(client: Client): Promise<PermissionSnapshot> {
  const roleCheck = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') AS exists;`,
  );
  if (!roleCheck.rows[0]?.exists) {
    return {
      hasSchemaUsage: false,
      tableGrantsCount: 0,
      sequenceGrantsCount: 0,
      hasSequenceUsage: false,
      hasSequenceSelect: false,
      defaultAclCount: 0,
      tableGrants: [],
    };
  }

  // 1. Schema USAGE (checking explicit grants to csi_app via aclexplode)
  const usageRes = await client.query<{ has_usage: boolean }>(
    `SELECT EXISTS (
       SELECT 1 
       FROM pg_namespace n,
            LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
       WHERE n.nspname = 'public' 
         AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'csi_app')
         AND acl.privilege_type = 'USAGE'
     ) AS has_usage;`,
  );
  const hasSchemaUsage = usageRes.rows[0]?.has_usage === true;

  // 2. Table grants in public schema
  const tablesRes = await client.query<{ table_name: string; privilege_type: string }>(
    `SELECT table_name, privilege_type 
     FROM information_schema.role_table_grants 
     WHERE grantee = 'csi_app' AND table_schema = 'public'
     ORDER BY table_name, privilege_type;`,
  );

  // 3. Sequence grants (verifying both USAGE and SELECT privileges on test sequence)
  const seqPrivRes = await client.query<{ has_usage: boolean; has_select: boolean }>(
    `SELECT 
       has_sequence_privilege('csi_app', 'public.test_lifecycle_seq', 'USAGE') AS has_usage,
       has_sequence_privilege('csi_app', 'public.test_lifecycle_seq', 'SELECT') AS has_select;`,
  );
  const hasSequenceUsage = seqPrivRes.rows[0]?.has_usage === true;
  const hasSequenceSelect = seqPrivRes.rows[0]?.has_select === true;

  const seqCountRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM information_schema.sequences s
     WHERE s.sequence_schema = 'public'
       AND has_sequence_privilege('csi_app', s.sequence_schema || '.' || s.sequence_name, 'USAGE');`,
  );
  const sequenceGrantsCount = parseInt(seqCountRes.rows[0]?.count || '0', 10);

  // 4. Default ACLs for csi_app
  const aclRes = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM pg_default_acl a 
     JOIN pg_roles r ON a.defaclrole = r.oid 
     WHERE defaclnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
       AND a.defaclacl::text LIKE '%csi_app%';`,
  );
  const defaultAclCount = parseInt(aclRes.rows[0]?.count || '0', 10);

  return {
    hasSchemaUsage,
    tableGrantsCount: tablesRes.rows.length,
    sequenceGrantsCount,
    hasSequenceUsage,
    hasSequenceSelect,
    defaultAclCount,
    tableGrants: tablesRes.rows,
  };
}

export interface MigrationLifecycleSafetyCheck {
  valid: boolean;
  status: 'PERMITTED' | 'REFUSED_NON_TEST_DB' | 'REFUSED_NOT_DISPOSABLE' | 'REFUSED_PRODUCTION';
  error?: string;
}

/**
 * Validates that migration lifecycle testing (with destructive DOWN rollbacks) is only executed
 * against an explicitly designated disposable test database (Requirement 5).
 */
export function validateMigrationLifecycleSafety(
  targetDb: string,
  env: NodeJS.ProcessEnv = process.env,
): MigrationLifecycleSafetyCheck {
  if (env.NODE_ENV === 'production') {
    return {
      valid: false,
      status: 'REFUSED_PRODUCTION',
      error: '[SAFETY FATAL] Migration lifecycle test is strictly prohibited in production mode (NODE_ENV=production).',
    };
  }

  const normalizedDb = (targetDb || '').trim().toLowerCase();
  if (normalizedDb !== 'csi_gcet_test') {
    return {
      valid: false,
      status: 'REFUSED_NON_TEST_DB',
      error: `[SAFETY FATAL] Migration lifecycle test refuses to run against "${targetDb}". Target MUST be strictly "csi_gcet_test".`,
    };
  }

  const isExplicitlyDisposable =
    env.TEST_DATABASE_DISPOSABLE === 'true' ||
    env.ALLOW_DESTRUCTIVE_DOWN_TESTING === 'true';

  if (!isExplicitlyDisposable) {
    return {
      valid: false,
      status: 'REFUSED_NOT_DISPOSABLE',
      error:
        `[SAFETY FATAL] Test database "${targetDb}" is not explicitly confirmed as disposable.\n` +
        `Executing destructive DOWN rollbacks requires setting TEST_DATABASE_DISPOSABLE=true or ALLOW_DESTRUCTIVE_DOWN_TESTING=true in environment.\n` +
        `Refusing destructive migration lifecycle testing to prevent unintended data loss.`,
    };
  }

  return { valid: true, status: 'PERMITTED' };
}

async function runMigrationTest() {
  console.log('🧪 Starting Migration Lifecycle Test (INT-11: UP -> DOWN -> UP)...');
  console.log(`📡 Connecting to test database: csi_gcet_test`);

  const client = new Client({ connectionString: testDbUrl });
  await client.connect();

  // Strict fail-closed target and disposability verification (Requirement 5 & Finding F-01)
  const dbCheck = await client.query<{ current_database: string }>('SELECT current_database();');
  const liveDbName = dbCheck.rows[0]?.current_database || '';

  const safetyCheck = validateMigrationLifecycleSafety(liveDbName, process.env);
  if (!safetyCheck.valid) {
    await client.end();
    throw new Error(safetyCheck.error);
  }
  console.log(`🔒 [VERIFIED] Live database verified as "${liveDbName}" and confirmed DISPOSABLE.`);

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
    'tasks',
    'checklists',
    'checklist_items',
    'checklist_runs',
    'committee_assets',
    'academic_terms',
    'term_snapshots',
    'term_rollovers',
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
    // Create dedicated test sequence to verify sequence USAGE & SELECT privilege lifecycle (Requirement 5)
    await client.query('CREATE SEQUENCE IF NOT EXISTS public.test_lifecycle_seq;');

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

    // Verify runtime role permissions after UP 1
    const up1Perms = await inspectRuntimePermissions(client);
    console.log(
      `🔒 [UP 1 Permissions] Schema USAGE: ${up1Perms.hasSchemaUsage}, Table Grants: ${up1Perms.tableGrantsCount}, Sequences (USAGE: ${up1Perms.hasSequenceUsage}, SELECT: ${up1Perms.hasSequenceSelect}), Default ACLs: ${up1Perms.defaultAclCount}`,
    );
    if (!up1Perms.hasSchemaUsage) {
      throw new Error('csi_app must have USAGE on schema public after UP migration');
    }
    if (up1Perms.tableGrantsCount === 0) {
      throw new Error('csi_app must have table DML privileges after UP migration');
    }
    if (!up1Perms.hasSequenceUsage || !up1Perms.hasSequenceSelect) {
      throw new Error('csi_app must have both USAGE and SELECT privileges on sequences after UP migration');
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

    // Verify runtime role permissions after DOWN rollback (Finding 2.1 & Requirement 5)
    const downPerms = await inspectRuntimePermissions(client);
    console.log(
      `🔒 [DOWN Permissions] Schema USAGE: ${downPerms.hasSchemaUsage}, Table Grants: ${downPerms.tableGrantsCount}, Sequences (USAGE: ${downPerms.hasSequenceUsage}, SELECT: ${downPerms.hasSequenceSelect}), Default ACLs: ${downPerms.defaultAclCount}`,
    );
    if (downPerms.hasSchemaUsage) {
      throw new Error(
        'FAILED: csi_app schema USAGE was not revoked after DOWN migration (Finding 2.1 rollback failure)!',
      );
    }
    if (downPerms.tableGrantsCount !== 0) {
      throw new Error(`FAILED: csi_app still has ${downPerms.tableGrantsCount} table grants after DOWN rollback!`);
    }
    if (downPerms.hasSequenceUsage || downPerms.hasSequenceSelect) {
      throw new Error(
        `FAILED: csi_app still has sequence USAGE (${downPerms.hasSequenceUsage}) or SELECT (${downPerms.hasSequenceSelect}) privileges after DOWN rollback!`,
      );
    }
    if (downPerms.defaultAclCount !== 0) {
      throw new Error(`FAILED: csi_app still has default privileges after DOWN rollback!`);
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

    // Verify runtime role permissions after UP 2 (restored cleanly)
    const up2Perms = await inspectRuntimePermissions(client);
    console.log(
      `🔒 [UP 2 Permissions] Schema USAGE: ${up2Perms.hasSchemaUsage}, Table Grants: ${up2Perms.tableGrantsCount}, Sequences (USAGE: ${up2Perms.hasSequenceUsage}, SELECT: ${up2Perms.hasSequenceSelect}), Default ACLs: ${up2Perms.defaultAclCount}`,
    );
    if (!up2Perms.hasSchemaUsage || up2Perms.tableGrantsCount === 0) {
      throw new Error('FAILED: csi_app privileges failed to restore after re-applying UP migration!');
    }
    if (!up2Perms.hasSequenceUsage || !up2Perms.hasSequenceSelect) {
      throw new Error('FAILED: csi_app sequence USAGE or SELECT privileges failed to restore after re-applying UP migration!');
    }
    console.log('✅ Runtime role (csi_app) least-privilege lifecycle verified: UP -> DOWN (cleanly revoked) -> UP (restored).');

    console.log('\n🎉 Migration lifecycle test PASSED! UP -> DOWN -> UP verified.');
  } finally {
    try {
      await client.query('DROP SEQUENCE IF EXISTS public.test_lifecycle_seq;');
    } catch {
      // ignore cleanup errors
    }
    await client.end();
  }
}

if (require.main === module) {
  runMigrationTest().catch((err) => {
    console.error('\n❌ Migration lifecycle test FAILED:', err);
    process.exit(1);
  });
}
