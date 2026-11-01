/**
 * CSI GCET Student Branch Platform — Backup & Disaster Recovery Tests (Module M19)
 *
 * Verifies backup creation, cryptographic checksum calculation, Table of Contents inspection,
 * retention policy enforcement, tamper detection, and target database safety guards.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  calculateSha256,
  enforceRetention,
  getToolVersions,
  verifyDumpTOC,
  runVerifyOnly,
} from '../../../../scripts/database/backup';
import {
  locateLatestBackup,
  runRestoreDrill,
} from '../../../../scripts/database/restore-drill';

describe('Database Backup & Disaster Recovery (Module M19)', () => {
  const testTmpDir = resolve(join('storage', 'test_backups_tmp'));

  beforeAll(() => {
    if (!existsSync(testTmpDir)) {
      mkdirSync(testTmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(testTmpDir)) {
      rmSync(testTmpDir, { recursive: true, force: true });
    }
  });

  describe('Cryptographic Checksum & Hash Verification', () => {
    it('should compute deterministic SHA-256 for binary files', () => {
      const sampleFile = join(testTmpDir, 'sample.bin');
      const sampleContent = Buffer.from('CSI GCET Student Branch M19 Disaster Recovery');
      writeFileSync(sampleFile, sampleContent);

      const expectedHash = createHash('sha256').update(sampleContent).digest('hex');
      const computedHash = calculateSha256(sampleFile);

      expect(computedHash).toBe(expectedHash);
      expect(computedHash).toHaveLength(64);
    });

    it('should detect altered or tampered file contents', () => {
      const originalFile = join(testTmpDir, 'original.bin');
      writeFileSync(originalFile, Buffer.from('Original content'));
      const originalHash = calculateSha256(originalFile);

      const tamperedFile = join(testTmpDir, 'tampered.bin');
      writeFileSync(tamperedFile, Buffer.from('Tampered content'));
      const tamperedHash = calculateSha256(tamperedFile);

      expect(originalHash).not.toBe(tamperedHash);
    });
  });

  describe('Tool Versions & Environment Detection', () => {
    it('should detect platform, node version, and pg_dump version', () => {
      const versions = getToolVersions();
      expect(versions.platform).toBe(process.platform);
      expect(versions.node).toBe(process.version);
      expect(typeof versions.pgDump).toBe('string');
      expect(versions.pgDump.length).toBeGreaterThan(0);
    });
  });

  describe('Table of Contents (TOC) Inspection', () => {
    it('should reject non-dump or invalid files', () => {
      const invalidDump = join(testTmpDir, 'corrupt.dump');
      writeFileSync(invalidDump, Buffer.from('Not a valid pg_dump custom archive header'));

      const result = verifyDumpTOC(invalidDump);
      expect(result.valid).toBe(false);
      expect(result.entryCount).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('Retention Policy Enforcement', () => {
    it('should retain only the specified keepCount of recent backups', () => {
      const retentionDir = join(testTmpDir, 'retention_test');
      if (!existsSync(retentionDir)) mkdirSync(retentionDir, { recursive: true });

      // Create 5 mock backup sets with different timestamps
      const baseNames = ['csi_backup_db_1', 'csi_backup_db_2', 'csi_backup_db_3', 'csi_backup_db_4', 'csi_backup_db_5'];

      for (let i = 0; i < baseNames.length; i++) {
        const name = baseNames[i];
        const dumpPath = join(retentionDir, `${name}.dump`);
        const jsonPath = join(retentionDir, `${name}.json`);
        const storagePath = join(retentionDir, `${name}.storage.tar.gz`);

        writeFileSync(dumpPath, `dump_${i}`);
        writeFileSync(jsonPath, `{"id":"${i}"}`);
        writeFileSync(storagePath, `storage_${i}`);
      }

      // Enforce retention keeping only 2
      const deleted = enforceRetention(retentionDir, 2);

      expect(deleted.length).toBeGreaterThan(0);
      // Ensure only 2 .dump files remain
      const remainingDumps = readdirSync(retentionDir).filter((f) => f.endsWith('.dump'));
      expect(remainingDumps.length).toBe(2);

      rmSync(retentionDir, { recursive: true, force: true });
    });

    it('should safely do nothing if backup count is below keepCount', () => {
      const retentionDir = join(testTmpDir, 'retention_small');
      if (!existsSync(retentionDir)) mkdirSync(retentionDir, { recursive: true });

      writeFileSync(join(retentionDir, 'csi_backup_a.dump'), 'dump');
      writeFileSync(join(retentionDir, 'csi_backup_a.json'), '{}');

      const deleted = enforceRetention(retentionDir, 5);
      expect(deleted).toHaveLength(0);

      rmSync(retentionDir, { recursive: true, force: true });
    });
  });

  describe('Backup Archive Verification (runVerifyOnly)', () => {
    it('should return false for missing dump file', () => {
      const nonExistent = join(testTmpDir, 'missing_file.dump');
      const result = runVerifyOnly(nonExistent);
      expect(result).toBe(false);
    });

    it('should return false if checksum does not match manifest', () => {
      const mockDump = join(testTmpDir, 'mismatch.dump');
      const mockJson = join(testTmpDir, 'mismatch.json');

      writeFileSync(mockDump, Buffer.from('mock dump binary data'));
      writeFileSync(
        mockJson,
        JSON.stringify({
          archiveSha256: '0000000000000000000000000000000000000000000000000000000000000000',
        }),
      );

      const result = runVerifyOnly(mockDump);
      expect(result).toBe(false);
    });
  });

  describe('Restore Drill Safety & Boundaries', () => {
    it('should reject restore drills with mismatched checksums', async () => {
      const badDump = join(testTmpDir, 'bad_checksum.dump');
      const badJson = join(testTmpDir, 'bad_checksum.json');

      writeFileSync(badDump, Buffer.from('dump data'));
      writeFileSync(
        badJson,
        JSON.stringify({
          backupId: randomUUID(),
          timestamp: new Date().toISOString(),
          sourceDatabase: 'csi_gcet_dev',
          archiveFilename: 'bad_checksum.dump',
          archiveSha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        }),
      );

      await expect(
        runRestoreDrill({
          backupPathOrId: badDump,
          targetDatabase: 'csi_gcet_test',
          reportsDir: join(testTmpDir, 'reports'),
          verifyOnly: true,
          jsonOutput: true,
        }),
      ).rejects.toThrow(/Checksum mismatch/);
    });

    it('should refuse live restoration if target database contains active tables', async () => {
      // Find latest backup in storage/backups
      const latest = locateLatestBackup(resolve(join('storage', 'backups')));
      if (!latest) {
        // Skip if no backup yet generated
        return;
      }

      // csi_gcet_dev and csi_gcet_test both contain active tables
      const drillResult = await runRestoreDrill({
        backupPathOrId: latest.dumpPath,
        targetDatabase: 'csi_gcet_dev', // Target populated database
        reportsDir: join(testTmpDir, 'reports'),
        verifyOnly: false,
        jsonOutput: true,
      });

      expect(drillResult.checksumMatch).toBe(true);
      expect(drillResult.tocValid).toBe(true);
      expect(drillResult.targetSafetyCheck).toBe('REFUSED_POPULATED_TARGET');
      expect(drillResult.existingTableCountInTarget).toBeGreaterThan(0);
      expect(drillResult.restoreExecutionStatus).toBe('BLOCKED');
      expect(drillResult.blockReason).toContain('Restoring over an active populated database is strictly prohibited');
      expect(existsSync(drillResult.reportPath!)).toBe(true);
    });

    it('should succeed in verify-only mode without modifying database', async () => {
      const latest = locateLatestBackup(resolve(join('storage', 'backups')));
      if (!latest) return;

      const drillResult = await runRestoreDrill({
        backupPathOrId: latest.dumpPath,
        targetDatabase: 'csi_gcet_test',
        reportsDir: join(testTmpDir, 'reports'),
        verifyOnly: true,
        jsonOutput: true,
      });

      expect(drillResult.checksumMatch).toBe(true);
      expect(drillResult.tocValid).toBe(true);
      expect(drillResult.targetSafetyCheck).toBe('SKIPPED_VERIFY_ONLY');
      expect(drillResult.restoreExecutionStatus).toBe('SKIPPED');
    });
  });
});
