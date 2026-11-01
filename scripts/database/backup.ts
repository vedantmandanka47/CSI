/**
 * CSI GCET Student Branch Platform — Database Backup Utility (Module M19)
 *
 * Automates PostgreSQL database backup generation, archive integrity verification,
 * storage asset packaging, manifest tracking, and retention cleanup.
 *
 * Usage:
 *   npx tsx scripts/database/backup.ts [options]
 *
 * Options:
 *   --database <name>     Source database name (default: csi_gcet_dev)
 *   --output <dir>        Backup output directory (default: storage/backups)
 *   --keep <count>        Number of recent backups to retain (default: 7)
 *   --no-storage          Skip packaging file storage (certificates, passports, assets)
 *   --verify-only <file>  Verify an existing backup archive and manifest
 *   --json                Output result manifest as JSON to stdout
 *   --help                Display this help message
 */

import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

// Load environment variables from apps/api/.env if available
const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });

export interface BackupToolVersions {
  pgDump: string;
  node: string;
  platform: string;
}

export interface BackupManifest {
  backupId: string;
  timestamp: string;
  sourceDatabase: string;
  format: 'pg_dump_custom';
  archiveFilename: string;
  archiveSizeBytes: number;
  archiveSha256: string;
  storageFilename?: string;
  storageSizeBytes?: number;
  storageSha256?: string;
  migrationVersion: string;
  tableCount: number;
  tables: string[];
  recordCounts: Record<string, number>;
  toolVersions: BackupToolVersions;
  verificationStatus: 'VERIFIED' | 'FAILED' | 'PENDING';
  verifiedAt?: string;
}

export interface BackupOptions {
  database: string;
  outputDir: string;
  keepCount: number;
  includeStorage: boolean;
  verifyOnlyFile?: string;
  jsonOutput: boolean;
}

export function parseArgs(args: string[]): BackupOptions {
  const options: BackupOptions = {
    database: 'csi_gcet_dev',
    outputDir: resolve(join('storage', 'backups')),
    keepCount: 7,
    includeStorage: true,
    jsonOutput: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--database' && i + 1 < args.length) {
      options.database = args[++i] || 'csi_gcet_dev';
    } else if (arg === '--output' && i + 1 < args.length) {
      options.outputDir = resolve(args[++i] || 'storage/backups');
    } else if (arg === '--keep' && i + 1 < args.length) {
      options.keepCount = Math.max(1, parseInt(args[++i] || '7', 10) || 7);
    } else if (arg === '--no-storage') {
      options.includeStorage = false;
    } else if (arg === '--verify-only' && i + 1 < args.length) {
      options.verifyOnlyFile = resolve(args[++i] || '');
    } else if (arg === '--json') {
      options.jsonOutput = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
CSI GCET SB — Automated Database Backup Utility (M19)

Options:
  --database <name>     Source database name (default: csi_gcet_dev)
  --output <dir>        Backup output directory (default: storage/backups)
  --keep <count>        Number of recent backups to retain (default: 7)
  --no-storage          Skip packaging file storage (certificates, passports, assets)
  --verify-only <file>  Verify an existing backup archive and manifest
  --json                Output result manifest as JSON to stdout
  --help                Display this help message
`);
      process.exit(0);
    }
  }

  return options;
}

export function calculateSha256(filePath: string): string {
  const fileBuffer = readFileSync(filePath);
  return createHash('sha256').update(fileBuffer).digest('hex');
}

export function getToolVersions(): BackupToolVersions {
  let pgDumpVersion = 'unknown';
  try {
    const out = execSync('pg_dump --version', { stdio: 'pipe' }).toString().trim();
    pgDumpVersion = out.replace(/^pg_dump\s+\(PostgreSQL\)\s+/, '');
  } catch {
    // ignore
  }

  return {
    pgDump: pgDumpVersion,
    node: process.version,
    platform: process.platform,
  };
}

export function verifyDumpTOC(dumpPath: string): { valid: boolean; entryCount: number; error?: string } {
  try {
    const output = execSync(`pg_restore --list "${dumpPath}"`, { stdio: 'pipe' }).toString();
    const lines = output.split('\n').filter((l) => l.trim().length > 0 && !l.startsWith(';'));
    return { valid: true, entryCount: lines.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, entryCount: 0, error: msg };
  }
}

export async function collectDatabaseMetadata(
  client: Client,
): Promise<{ tableCount: number; tables: string[]; recordCounts: Record<string, number>; migrationVersion: string }> {
  // 1. Tables list
  const tablesRes = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
  );
  const tables = tablesRes.rows.map((r) => r.table_name);

  // 2. Sample record counts for key domain tables
  const trackedTables = [
    'users',
    'roles',
    'role_assignments',
    'committees',
    'events',
    'registrations',
    'attendance_sessions',
    'attendance_records',
    'certificates',
    'passports',
    'tasks',
    'checklists',
    'checklist_runs',
    'committee_assets',
    'academic_terms',
    'term_snapshots',
    'term_rollovers',
    'audit_log',
  ];

  const recordCounts: Record<string, number> = {};
  for (const table of trackedTables) {
    if (tables.includes(table)) {
      try {
        const countRes = await client.query<{ count: string }>(`SELECT COUNT(*)::text as count FROM "${table}";`);
        recordCounts[table] = parseInt(countRes.rows[0]?.count || '0', 10);
      } catch {
        recordCounts[table] = -1;
      }
    }
  }

  // 3. Latest migration version
  let migrationVersion = 'unknown';
  if (tables.includes('_prisma_migrations')) {
    try {
      const migRes = await client.query<{ migration_name: string }>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY finished_at DESC LIMIT 1;`,
      );
      if (migRes.rows[0]?.migration_name) {
        migrationVersion = migRes.rows[0].migration_name;
      }
    } catch {
      // ignore
    }
  }

  return {
    tableCount: tables.length,
    tables,
    recordCounts,
    migrationVersion,
  };
}

export function enforceRetention(backupDir: string, keepCount: number): string[] {
  if (!existsSync(backupDir)) return [];

  const resolvedDir = resolve(backupDir);
  const files = readdirSync(resolvedDir);
  const dumpFiles = files
    .filter((f) => f.startsWith('csi_backup_') && f.endsWith('.dump'))
    .map((f) => {
      const fullPath = join(resolvedDir, f);
      return {
        name: f,
        fullPath,
        time: statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.time - a.time);

  const deletedFiles: string[] = [];
  if (dumpFiles.length > keepCount) {
    const toDelete = dumpFiles.slice(keepCount);
    for (const item of toDelete) {
      const baseName = item.name.replace(/\.dump$/, '');

      // Delete dump, manifest, and storage files safely
      const candidates = [
        item.fullPath,
        join(resolvedDir, `${baseName}.json`),
        join(resolvedDir, `${baseName}.storage.tar.gz`),
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          // Verify candidate resides strictly inside the backup directory (jail check)
          const resolvedCandidate = resolve(candidate);
          if (resolvedCandidate.startsWith(resolvedDir)) {
            unlinkSync(candidate);
            deletedFiles.push(basename(candidate));
          }
        }
      }
    }
  }

  return deletedFiles;
}

export async function runBackup(options: BackupOptions): Promise<BackupManifest> {
  const connectionUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionUrl) {
    throw new Error('Neither MIGRATION_DATABASE_URL nor DATABASE_URL is defined.');
  }

  const parsedUrl = new URL(connectionUrl);
  const allowedHosts = ['localhost', '127.0.0.1', '::1'];
  if (!allowedHosts.includes(parsedUrl.hostname)) {
    throw new Error(`[SAFETY FATAL] Host "${parsedUrl.hostname}" is not local. Remote backups are prohibited.`);
  }

  // Ensure output directory exists
  if (!existsSync(options.outputDir)) {
    mkdirSync(options.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const fileTimestamp = timestamp.replace(/[-:]/g, '').replace(/\..+/, '');
  const backupId = randomUUID();
  const shortId = backupId.slice(0, 8);
  const baseName = `csi_backup_${options.database}_${fileTimestamp}_${shortId}`;
  const dumpFilename = `${baseName}.dump`;
  const dumpFilePath = join(options.outputDir, dumpFilename);
  const manifestFilename = `${baseName}.json`;
  const manifestFilePath = join(options.outputDir, manifestFilename);

  if (!options.jsonOutput) {
    console.log('================================================================');
    console.log(' CSI GCET SB — Automated Database Backup (Module M19)');
    console.log('================================================================');
    console.log(` Target Database: ${options.database}`);
    console.log(` Output Archive:  ${dumpFilePath}`);
    console.log(` Backup ID:       ${backupId}`);
  }

  // 1. Connect to source database and verify it exists and is local
  const client = new Client({
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '5432', 10),
    user: parsedUrl.username,
    password: decodeURIComponent(parsedUrl.password),
    database: options.database,
  });

  await client.connect();
  const checkRes = await client.query<{ current_database: string }>('SELECT current_database();');
  const liveDbName = checkRes.rows[0]?.current_database;
  if (liveDbName !== options.database) {
    await client.end();
    throw new Error(`Connected database "${liveDbName}" does not match requested target "${options.database}".`);
  }

  const metadata = await collectDatabaseMetadata(client);
  await client.end();

  if (!options.jsonOutput) {
    console.log(` Public Tables:   ${metadata.tableCount}`);
    console.log(` Migration:       ${metadata.migrationVersion}`);
    console.log('\n[1/4] Executing pg_dump custom archive export...');
  }

  // 2. Execute pg_dump with custom format (-Fc)
  const host = parsedUrl.hostname;
  const port = parsedUrl.port || '5432';
  const username = parsedUrl.username;
  const password = decodeURIComponent(parsedUrl.password);

  const dumpCmd = `pg_dump -h "${host}" -p ${port} -U "${username}" -Fc -f "${dumpFilePath}" "${options.database}"`;
  execSync(dumpCmd, {
    env: { ...process.env, PGPASSWORD: password },
    stdio: 'pipe',
  });

  const archiveSizeBytes = statSync(dumpFilePath).size;
  const archiveSha256 = calculateSha256(dumpFilePath);

  if (!options.jsonOutput) {
    console.log(`      Created: ${dumpFilename} (${archiveSizeBytes.toLocaleString()} bytes)`);
    console.log(`      SHA-256: ${archiveSha256}`);
    console.log('\n[2/4] Verifying archive integrity and Table of Contents...');
  }

  // 3. Verify Table of Contents via pg_restore --list
  const tocResult = verifyDumpTOC(dumpFilePath);
  if (!tocResult.valid) {
    throw new Error(`pg_restore TOC validation failed for generated archive: ${tocResult.error}`);
  }

  if (!options.jsonOutput) {
    console.log(`      [PASS] TOC parsed successfully with ${tocResult.entryCount} catalog entries.`);
  }

  // 4. File storage packaging (optional)
  let storageFilename: string | undefined;
  let storageSizeBytes: number | undefined;
  let storageSha256: string | undefined;

  if (options.includeStorage) {
    const storageSourceDir = resolve(join('apps', 'api', 'storage'));
    if (existsSync(storageSourceDir)) {
      if (!options.jsonOutput) {
        console.log('\n[3/4] Packaging active file storage assets...');
      }
      storageFilename = `${baseName}.storage.tar.gz`;
      const storageFilePath = join(options.outputDir, storageFilename);

      try {
        execSync(`tar -czf "${storageFilePath}" -C "${storageSourceDir}" .`, { stdio: 'pipe' });
        if (existsSync(storageFilePath)) {
          storageSizeBytes = statSync(storageFilePath).size;
          storageSha256 = calculateSha256(storageFilePath);
          if (!options.jsonOutput) {
            console.log(`      Created: ${storageFilename} (${storageSizeBytes.toLocaleString()} bytes)`);
            console.log(`      SHA-256: ${storageSha256}`);
          }
        }
      } catch (err: unknown) {
        console.warn(`[WARN] File storage packaging skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 5. Build and write manifest
  const toolVersions = getToolVersions();
  const manifest: BackupManifest = {
    backupId,
    timestamp,
    sourceDatabase: options.database,
    format: 'pg_dump_custom',
    archiveFilename: dumpFilename,
    archiveSizeBytes,
    archiveSha256,
    storageFilename,
    storageSizeBytes,
    storageSha256,
    migrationVersion: metadata.migrationVersion,
    tableCount: metadata.tableCount,
    tables: metadata.tables,
    recordCounts: metadata.recordCounts,
    toolVersions,
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date().toISOString(),
  };

  writeFileSync(manifestFilePath, JSON.stringify(manifest, null, 2), 'utf-8');

  // 6. Retention enforcement
  if (!options.jsonOutput) {
    console.log('\n[4/4] Enforcing retention policy...');
  }
  const pruned = enforceRetention(options.outputDir, options.keepCount);
  if (!options.jsonOutput) {
    if (pruned.length > 0) {
      console.log(`      Pruned ${pruned.length} expired file(s): ${pruned.join(', ')}`);
    } else {
      console.log(`      Retention clean. Retaining up to ${options.keepCount} backups.`);
    }
    console.log('================================================================');
    console.log(' BACKUP COMPLETED & VERIFIED SUCCESSFULLY');
    console.log(` Manifest: ${manifestFilePath}`);
    console.log('================================================================');
  } else {
    console.log(JSON.stringify(manifest, null, 2));
  }

  return manifest;
}

export function runVerifyOnly(filePath: string): boolean {
  console.log('================================================================');
  console.log(' CSI GCET SB — Backup Archive Verification');
  console.log('================================================================');
  console.log(` Target File: ${filePath}`);

  if (!existsSync(filePath)) {
    console.error(`[FATAL] File not found: ${filePath}`);
    return false;
  }

  const manifestPath = filePath.endsWith('.dump')
    ? filePath.replace(/\.dump$/, '.json')
    : filePath.endsWith('.json')
      ? filePath
      : `${filePath}.json`;
  const dumpPath = filePath.endsWith('.json') ? filePath.replace(/\.json$/, '.dump') : filePath;

  if (!existsSync(dumpPath)) {
    console.error(`[FATAL] Dump archive not found: ${dumpPath}`);
    return false;
  }

  const computedHash = calculateSha256(dumpPath);
  console.log(` Computed SHA-256: ${computedHash}`);

  if (existsSync(manifestPath)) {
    const manifest: BackupManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    console.log(` Manifest SHA-256: ${manifest.archiveSha256}`);
    if (computedHash !== manifest.archiveSha256) {
      console.error('[FAILED] Checksum mismatch against manifest!');
      return false;
    }
    console.log(' [PASS] Checksum matched manifest.');
  } else {
    console.warn(' [WARN] Companion manifest not found. Verifying archive TOC only...');
  }

  const toc = verifyDumpTOC(dumpPath);
  if (!toc.valid) {
    console.error(`[FAILED] pg_restore TOC inspection failed: ${toc.error}`);
    return false;
  }

  console.log(` [PASS] Archive Table of Contents valid (${toc.entryCount} catalog entries).`);
  console.log('================================================================');
  console.log(' VERIFICATION RESULT: VALID & UNCORRUPTED');
  console.log('================================================================');
  return true;
}

// Direct CLI entry point
if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  if (options.verifyOnlyFile) {
    const ok = runVerifyOnly(options.verifyOnlyFile);
    process.exit(ok ? 0 : 1);
  } else {
    runBackup(options)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('\n[FATAL] Backup failed:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      });
  }
}
