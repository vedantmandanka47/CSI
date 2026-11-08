#!/usr/bin/env tsx
/**
 * CSI GCET SB — Storage Reconciliation & Orphaned File Cleanup Routine (TASK-028 / HR-010 / F39)
 *
 * Scans managed storage namespaces (workspaces/assets, certificates, passports) and reconciles
 * filesystem contents against authoritative database records (CommitteeAsset, Certificate, Passport).
 *
 * Identifies:
 *   - Orphaned files (present on storage, but unreferenced or deleted in database)
 *   - Missing files (referenced in database, but missing on storage)
 *   - Stale temporary files (.tmp.* files older than 15 minutes abandoned by crashed write routines)
 *
 * Usage:
 *   npx tsx scripts/maintenance/reconcile-storage.ts --dry-run
 *   npx tsx scripts/maintenance/reconcile-storage.ts --quarantine
 *   npx tsx scripts/maintenance/reconcile-storage.ts --prune
 */

import { resolve, join, basename, relative, dirname } from 'node:path';
import { existsSync, readdirSync, statSync, unlinkSync, mkdirSync, renameSync, rmdirSync } from 'node:fs';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables from apps/api/.env or root .env
const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });
dotenv.config();

const STALE_TEMP_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export type ReconciliationMode = 'dry-run' | 'quarantine' | 'prune';

export interface ReconciliationOptions {
  mode?: ReconciliationMode;
  storageRootDir?: string;
  silent?: boolean;
}

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  mtimeMs: number;
  isTempFile: boolean;
}

export interface CategoryReconciliation {
  category: string;
  scannedFilesCount: number;
  dbRecordsCount: number;
  orphanedFiles: DiscoveredFile[];
  missingFiles: string[];
  staleTempFiles: DiscoveredFile[];
  orphanedBytes: number;
  staleTempBytes: number;
  quarantinedCount: number;
  prunedCount: number;
}

export interface ReconciliationReport {
  mode: ReconciliationMode;
  storageRootDir: string;
  timestamp: string;
  categories: CategoryReconciliation[];
  totalScannedFiles: number;
  totalDbRecords: number;
  totalOrphanedFiles: number;
  totalMissingFiles: number;
  totalStaleTempFiles: number;
  totalOrphanedBytes: number;
  totalFreedBytes: number;
}

/**
 * Resolves the canonical root storage directory.
 */
export function resolveStorageRoot(overrideDir?: string): string {
  if (overrideDir) return resolve(overrideDir);
  if (process.env.STORAGE_ROOT_DIR) return resolve(process.env.STORAGE_ROOT_DIR);
  const cwd = process.cwd();
  if (basename(cwd) === 'api' || cwd.endsWith('apps/api') || cwd.endsWith('apps\\api')) {
    return resolve(cwd, 'storage');
  } else if (existsSync(resolve(cwd, 'apps/api/storage'))) {
    return resolve(cwd, 'apps/api/storage');
  } else if (existsSync(resolve(cwd, 'apps/api'))) {
    return resolve(cwd, 'apps/api/storage');
  }
  return resolve(cwd, 'storage');
}

/**
 * Recursively scans directory for files, ignoring VCS metadata and quarantine directories.
 */
export function scanDirectoryRecursive(dir: string, baseDir: string = dir): DiscoveredFile[] {
  if (!existsSync(dir)) return [];
  const results: DiscoveredFile[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'quarantine' || entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }
      results.push(...scanDirectoryRecursive(fullPath, baseDir));
    } else if (entry.isFile()) {
      if (entry.name === '.gitkeep' || entry.name === '.gitignore') {
        continue;
      }
      const stat = statSync(fullPath);
      const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
      const isTemp =
        entry.name.includes('.tmp.') ||
        entry.name.endsWith('.tmp') ||
        entry.name.endsWith('.temp') ||
        entry.name.startsWith('.tmp');

      results.push({
        absolutePath: fullPath,
        relativePath: relPath,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
        isTempFile: isTemp,
      });
    }
  }

  return results;
}

/**
 * Safely removes empty directories recursively up to the stop directory.
 */
function cleanEmptyDirs(dir: string, stopDir: string): void {
  if (dir === stopDir || !dir.startsWith(stopDir)) return;
  try {
    const files = readdirSync(dir);
    if (files.length === 0) {
      rmdirSync(dir);
      cleanEmptyDirs(dirname(dir), stopDir);
    }
  } catch {
    // Ignore cleanup failures on active directories
  }
}

/**
 * Core storage reconciliation engine.
 */
export async function reconcileStorage(
  options: ReconciliationOptions = {},
  prismaClient?: PrismaClient,
): Promise<ReconciliationReport> {
  const mode: ReconciliationMode = options.mode || 'dry-run';
  const storageRootDir = resolveStorageRoot(options.storageRootDir);
  const prisma = prismaClient || new PrismaClient();
  const shouldDisconnect = !prismaClient;

  const now = Date.now();
  const categories: CategoryReconciliation[] = [];

  const categoryConfigs = [
    {
      name: 'workspaces/assets',
      storageSubDir: join('workspaces', 'assets'),
      fetchDbPaths: async () => {
        const records = await prisma.committeeAsset.findMany({
          select: { storagePath: true },
        });
        return new Set(
          records
            .map((r) => r.storagePath?.replace(/\\/g, '/').replace(/^\/+/, ''))
            .filter((p): p is string => Boolean(p)),
        );
      },
    },
    {
      name: 'certificates',
      storageSubDir: 'certificates',
      fetchDbPaths: async () => {
        const records = await prisma.certificate.findMany({
          where: { storagePath: { not: null } },
          select: { storagePath: true },
        });
        return new Set(
          records
            .map((r) => r.storagePath?.replace(/\\/g, '/').replace(/^\/+/, ''))
            .filter((p): p is string => Boolean(p)),
        );
      },
    },
    {
      name: 'passports',
      storageSubDir: 'passports',
      fetchDbPaths: async () => {
        const records = await prisma.passport.findMany({
          where: { storagePath: { not: null } },
          select: { storagePath: true },
        });
        return new Set(
          records
            .map((r) => r.storagePath?.replace(/\\/g, '/').replace(/^\/+/, ''))
            .filter((p): p is string => Boolean(p)),
        );
      },
    },
  ];

  try {
    for (const config of categoryConfigs) {
      const categoryDir = resolve(storageRootDir, config.storageSubDir);
      const dbPaths = await config.fetchDbPaths();

      const discovered = scanDirectoryRecursive(categoryDir);
      const orphanedFiles: DiscoveredFile[] = [];
      const staleTempFiles: DiscoveredFile[] = [];
      const diskPathSet = new Set<string>();

      for (const file of discovered) {
        diskPathSet.add(file.relativePath);

        if (file.isTempFile) {
          if (now - file.mtimeMs > STALE_TEMP_THRESHOLD_MS) {
            staleTempFiles.push(file);
          }
          continue;
        }

        if (!dbPaths.has(file.relativePath)) {
          orphanedFiles.push(file);
        }
      }

      // Check for missing files referenced in DB
      const missingFiles: string[] = [];
      for (const dbPath of dbPaths) {
        if (!diskPathSet.has(dbPath)) {
          missingFiles.push(dbPath);
        }
      }

      const orphanedBytes = orphanedFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
      const staleTempBytes = staleTempFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
      let quarantinedCount = 0;
      let prunedCount = 0;

      if (mode === 'prune') {
        // Delete orphaned files
        for (const file of orphanedFiles) {
          try {
            if (existsSync(file.absolutePath)) {
              unlinkSync(file.absolutePath);
              prunedCount++;
              cleanEmptyDirs(dirname(file.absolutePath), categoryDir);
            }
          } catch (err) {
            if (!options.silent) {
              console.warn(`[WARN] Failed to delete orphaned file '${file.absolutePath}':`, err);
            }
          }
        }

        // Delete stale temp files
        for (const file of staleTempFiles) {
          try {
            if (existsSync(file.absolutePath)) {
              unlinkSync(file.absolutePath);
              prunedCount++;
              cleanEmptyDirs(dirname(file.absolutePath), categoryDir);
            }
          } catch (err) {
            if (!options.silent) {
              console.warn(`[WARN] Failed to delete stale temp file '${file.absolutePath}':`, err);
            }
          }
        }
      } else if (mode === 'quarantine') {
        const quarantineCategoryDir = resolve(storageRootDir, 'quarantine', config.storageSubDir);
        for (const file of orphanedFiles) {
          try {
            if (existsSync(file.absolutePath)) {
              const targetPath = resolve(quarantineCategoryDir, file.relativePath);
              mkdirSync(dirname(targetPath), { recursive: true });
              renameSync(file.absolutePath, targetPath);
              quarantinedCount++;
              cleanEmptyDirs(dirname(file.absolutePath), categoryDir);
            }
          } catch (err) {
            if (!options.silent) {
              console.warn(`[WARN] Failed to quarantine file '${file.absolutePath}':`, err);
            }
          }
        }
      }

      categories.push({
        category: config.name,
        scannedFilesCount: discovered.length,
        dbRecordsCount: dbPaths.size,
        orphanedFiles,
        missingFiles,
        staleTempFiles,
        orphanedBytes,
        staleTempBytes,
        quarantinedCount,
        prunedCount,
      });
    }

    const totalScannedFiles = categories.reduce((acc, c) => acc + c.scannedFilesCount, 0);
    const totalDbRecords = categories.reduce((acc, c) => acc + c.dbRecordsCount, 0);
    const totalOrphanedFiles = categories.reduce((acc, c) => acc + c.orphanedFiles.length, 0);
    const totalMissingFiles = categories.reduce((acc, c) => acc + c.missingFiles.length, 0);
    const totalStaleTempFiles = categories.reduce((acc, c) => acc + c.staleTempFiles.length, 0);
    const totalOrphanedBytes = categories.reduce((acc, c) => acc + c.orphanedBytes, 0);
    const totalFreedBytes =
      mode === 'prune'
        ? categories.reduce((acc, c) => acc + c.orphanedBytes + c.staleTempBytes, 0)
        : mode === 'quarantine'
          ? categories.reduce((acc, c) => acc + c.orphanedBytes, 0)
          : 0;

    return {
      mode,
      storageRootDir,
      timestamp: new Date().toISOString(),
      categories,
      totalScannedFiles,
      totalDbRecords,
      totalOrphanedFiles,
      totalMissingFiles,
      totalStaleTempFiles,
      totalOrphanedBytes,
      totalFreedBytes,
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

/**
 * Format bytes into human-readable representation.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let mode: ReconciliationMode = 'dry-run';
  let storageRootDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--prune' || arg === '--delete') {
      mode = 'prune';
    } else if (arg === '--quarantine') {
      mode = 'quarantine';
    } else if (arg === '--dry-run') {
      mode = 'dry-run';
    } else if (arg === '--storage-dir' && args[i + 1]) {
      storageRootDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
CSI GCET SB — Storage Reconciliation & Orphaned File Cleanup Routine

Usage:
  tsx scripts/maintenance/reconcile-storage.ts [options]

Options:
  --dry-run       Report orphaned and missing files without altering storage (default)
  --quarantine    Move orphaned files to <storageRoot>/quarantine/ preserving structure
  --prune         Permanently delete unreferenced files and stale temp files
  --storage-dir   Override base storage root directory path
  --help, -h      Display this documentation
`);
      process.exit(0);
    }
  }

  console.log('================================================================');
  console.log(' CSI GCET SB — Storage Reconciliation Routine (HR-010 / F39)');
  console.log(` Executed at: ${new Date().toISOString()}`);
  console.log(` Operational Mode: ${mode.toUpperCase()}`);
  console.log('================================================================\n');

  try {
    const report = await reconcileStorage({ mode, storageRootDir });

    console.log(`Storage Root: ${report.storageRootDir}`);
    console.log(`Scanned Total Files: ${report.totalScannedFiles}`);
    console.log(`Total Database Records: ${report.totalDbRecords}`);
    console.log(`Total Orphaned Files: ${report.totalOrphanedFiles} (${formatBytes(report.totalOrphanedBytes)})`);
    console.log(`Total Stale Temp Files: ${report.totalStaleTempFiles}`);
    console.log(`Total Missing Files in Storage: ${report.totalMissingFiles}\n`);

    for (const cat of report.categories) {
      console.log(`--- Category: ${cat.category} ---`);
      console.log(`  Scanned: ${cat.scannedFilesCount} | Referenced in DB: ${cat.dbRecordsCount}`);
      console.log(`  Orphans: ${cat.orphanedFiles.length} (${formatBytes(cat.orphanedBytes)})`);
      console.log(`  Stale Temp: ${cat.staleTempFiles.length} (${formatBytes(cat.staleTempBytes)})`);
      console.log(`  Missing on Disk: ${cat.missingFiles.length}`);

      if (cat.orphanedFiles.length > 0) {
        console.log('  Orphaned file paths:');
        for (const file of cat.orphanedFiles.slice(0, 10)) {
          console.log(`    - ${file.relativePath} (${formatBytes(file.sizeBytes)})`);
        }
        if (cat.orphanedFiles.length > 10) {
          console.log(`    ... and ${cat.orphanedFiles.length - 10} more`);
        }
      }

      if (cat.missingFiles.length > 0) {
        console.log('  Missing file references:');
        for (const path of cat.missingFiles.slice(0, 5)) {
          console.log(`    ! ${path}`);
        }
        if (cat.missingFiles.length > 5) {
          console.log(`    ... and ${cat.missingFiles.length - 5} more`);
        }
      }

      if (mode === 'prune') {
        console.log(`  [PRUNED] Cleaned up ${cat.prunedCount} orphaned/stale files.`);
      } else if (mode === 'quarantine') {
        console.log(`  [QUARANTINED] Moved ${cat.quarantinedCount} orphaned files to quarantine.`);
      }
      console.log('');
    }

    if (mode === 'dry-run') {
      console.log('Dry run completed successfully. No filesystem changes were made.');
      if (report.totalOrphanedFiles > 0 || report.totalStaleTempFiles > 0) {
        console.log('Run with --quarantine to isolate unreferenced files or --prune to reclaim storage.');
      }
    } else if (mode === 'prune') {
      console.log(`Prune routine completed successfully. Freed: ${formatBytes(report.totalFreedBytes)}.`);
    } else if (mode === 'quarantine') {
      console.log(`Quarantine routine completed successfully. Quarantined: ${formatBytes(report.totalFreedBytes)}.`);
    }
  } catch (err: unknown) {
    console.error(`[FATAL] Storage reconciliation failure: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Execute if run directly from CLI
const isCli = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('reconcile-storage.ts') ||
      process.argv[1].endsWith('reconcile-storage.js')),
);

if (isCli) {
  main();
}
