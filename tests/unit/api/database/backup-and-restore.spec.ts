/**
 * CSI GCET Student Branch Platform — Backup & Disaster Recovery Tests (Module M19)
 *
 * Verifies backup creation, cryptographic checksum calculation, Table of Contents inspection,
 * retention policy enforcement, tamper detection, and target database safety guards.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  calculateSha256,
  enforceRetention,
  getToolVersions,
  verifyDumpTOC,
  runVerifyOnly,
  resolveEffectiveStorageDir,
  countFilesInDir,
  verifyStorageArchive,
  validateArchiveMemberPaths,
  validateSafeArchiveMemberPath,
  parseAndValidateTarArchive,
  safeExtractStorageArchive,
  calculateTarHeaderChecksum,
  parsePaxAttributes,
  collectStorageManifest,
  verifyExtractedStorage,
  verifyNoSymlinksOrEscapes,
  MAX_DECOMPRESSED_ARCHIVE_BYTES,
  MAX_ARCHIVE_MEMBER_COUNT,
  MAX_SINGLE_FILE_BYTES,
} from '../../../../scripts/database/backup';
import {
  locateLatestBackup,
  runRestoreDrill,
  validateTargetSafety,
  redactDatabaseUrl,
  verifyRestoredDatabase,
  buildForeignKeyIntegrityQuery,
  verifyRestoreRolePrivileges,
  DEFAULT_APPROVED_RESTORE_TARGETS,
  DEFAULT_APPROVED_RESTORE_ROLES,
} from '../../../../scripts/database/restore-drill';
import { validateMigrationLifecycleSafety } from '../../../../scripts/database/test-migration-lifecycle';
import { Client } from 'pg';

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

    it('should succeed in verify-only mode even if database connection env vars are missing', async () => {
      const origMigUrl = process.env.MIGRATION_DATABASE_URL;
      const origDbUrl = process.env.DATABASE_URL;
      try {
        delete process.env.MIGRATION_DATABASE_URL;
        delete process.env.DATABASE_URL;

        const mockDump = join(testTmpDir, 'no_db_test.dump');
        const mockJson = join(testTmpDir, 'no_db_test.json');
        writeFileSync(mockDump, Buffer.from('mock binary'));
        const hash = calculateSha256(mockDump);
        writeFileSync(
          mockJson,
          JSON.stringify({
            backupId: randomUUID(),
            timestamp: new Date().toISOString(),
            sourceDatabase: 'csi_gcet_dev',
            archiveFilename: 'no_db_test.dump',
            archiveSha256: hash,
            tableCount: 0,
            tables: [],
            recordCounts: {},
          }),
        );

        // Verify that running in verifyOnly mode does not throw "Database connection string is missing"
        // It will fail TOC because 'mock binary' is not pg_dump, but confirms DB connection is not requested.
        await expect(
          runRestoreDrill({
            backupPathOrId: mockDump,
            targetDatabase: 'csi_gcet_test',
            reportsDir: join(testTmpDir, 'reports'),
            verifyOnly: true,
            jsonOutput: true,
          }),
        ).rejects.toThrow(/pg_restore TOC inspection failed/);
      } finally {
        if (origMigUrl) process.env.MIGRATION_DATABASE_URL = origMigUrl;
        if (origDbUrl) process.env.DATABASE_URL = origDbUrl;
      }
    });
  });

  describe('Storage Directory Resolution & Packaging', () => {
    const originalEnvStorage = process.env.STORAGE_ROOT_DIR;

    afterEach(() => {
      if (originalEnvStorage !== undefined) {
        process.env.STORAGE_ROOT_DIR = originalEnvStorage;
      } else {
        delete process.env.STORAGE_ROOT_DIR;
      }
    });

    it('should respect STORAGE_ROOT_DIR environment variable when set', () => {
      const customPath = join(testTmpDir, 'env_storage_root');
      process.env.STORAGE_ROOT_DIR = customPath;

      const result = resolveEffectiveStorageDir();
      expect(result.dir).toBe(resolve(customPath));
      expect(result.isConfigured).toBe(true);
    });

    it('should prioritize explicit custom argument over STORAGE_ROOT_DIR', () => {
      process.env.STORAGE_ROOT_DIR = join(testTmpDir, 'env_storage_root');
      const argPath = join(testTmpDir, 'cli_override_storage');

      const result = resolveEffectiveStorageDir(argPath);
      expect(result.dir).toBe(resolve(argPath));
      expect(result.isConfigured).toBe(true);
    });

    it('should fall back to development workspace path when unconfigured', () => {
      delete process.env.STORAGE_ROOT_DIR;
      const result = resolveEffectiveStorageDir();
      expect(result.isConfigured).toBe(false);
      expect(result.dir).toMatch(/(storage|apps[\\/]api[\\/]storage)$/);
    });

    it('should recursively count files in a directory', () => {
      const sampleDir = join(testTmpDir, 'sample_storage_tree');
      mkdirSync(join(sampleDir, 'sub'), { recursive: true });
      writeFileSync(join(sampleDir, 'file1.txt'), 'hello');
      writeFileSync(join(sampleDir, 'sub', 'file2.txt'), 'world');

      const count = countFilesInDir(sampleDir);
      expect(count).toBe(2);
    });

    it('should reject invalid storage archives in verifyStorageArchive', () => {
      const nonArchive = join(testTmpDir, 'not_an_archive.tar.gz');
      writeFileSync(nonArchive, Buffer.from('invalid tar gz content'));

      const result = verifyStorageArchive(nonArchive);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Restore Drill Target Safety & Explicit Allowlist (Finding 2.3)', () => {
    it('should approve valid targets present in the explicit allowlist', () => {
      for (const target of DEFAULT_APPROVED_RESTORE_TARGETS) {
        const result = validateTargetSafety(target, `postgresql://csi_migrator:pass@localhost:5432/${target}`);
        expect(result.valid).toBe(true);
        expect(result.status).toBe('PASSED_EMPTY_TARGET');
      }
    });

    it('should reject production databases even if attempted on localhost', () => {
      const prodTargets = ['csi_gcet_prod', 'csi_gcet_production', 'prod', 'production', 'csi_prod'];
      for (const target of prodTargets) {
        const result = validateTargetSafety(target, `postgresql://csi_migrator:pass@localhost:5432/${target}`);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_PROTECTED_TARGET');
        expect(result.reason).toContain('Restorations into development, production, live, or system databases are strictly prohibited');
      }
    });

    it('should reject development databases to prevent wiping active development data', () => {
      const devTargets = ['csi_gcet_dev', 'dev', 'development', 'csi_dev'];
      for (const target of devTargets) {
        const result = validateTargetSafety(target, `postgresql://csi_migrator:pass@localhost:5432/${target}`);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_PROTECTED_TARGET');
        expect(result.reason).toContain('Restorations into development, production, live, or system databases are strictly prohibited');
      }
    });

    it('should reject unknown arbitrary database names not in the allowlist', () => {
      const arbitraryTargets = ['arbitrary_db', 'csi_gcet_staging', 'scratch_db', 'my_custom_test'];
      for (const target of arbitraryTargets) {
        const result = validateTargetSafety(target, `postgresql://csi_migrator:pass@localhost:5432/${target}`);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_UNAPPROVED_TARGET');
        expect(result.reason).toContain('not in the approved restore targets allowlist');
      }
    });

    it('should reject unexpected non-loopback database hosts (remote targets)', () => {
      const remoteHosts = ['remote-db.gcet.edu.in', '192.168.1.50', 'aws-rds.amazonaws.com', '10.0.0.1'];
      for (const host of remoteHosts) {
        const result = validateTargetSafety('csi_gcet_test', `postgresql://csi_migrator:pass@${host}:5432/csi_gcet_test`);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_REMOTE_HOST');
        expect(result.reason).toContain('not local loopback');
      }
    });

    it('should reject runtime application user csi_app for restore operations', () => {
      const runtimeUserUrl = 'postgresql://csi_app:pass@localhost:5432/csi_gcet_test';
      const result = validateTargetSafety('csi_gcet_test', runtimeUserUrl);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('REFUSED_DISALLOWED_USER');
      expect(result.reason).toContain('Runtime application role "csi_app" cannot be used to execute restore drills');
    });

    it('should reject PostgreSQL superuser roles like postgres, root, admin (Requirement 1)', () => {
      const superusers = ['postgres', 'root', 'superuser', 'admin'];
      for (const su of superusers) {
        const url = `postgresql://${su}:secret@localhost:5432/csi_gcet_test`;
        const result = validateTargetSafety('csi_gcet_test', url);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_SUPERUSER_ROLE');
        expect(result.reason).toContain('PostgreSQL superuser');
      }
    });

    it('should reject unexpected login roles not in approved restore roles (Requirement 1)', () => {
      const unexpectedUsers = ['some_user', 'app_developer', 'reporting_user', 'guest'];
      for (const user of unexpectedUsers) {
        const url = `postgresql://${user}:secret@localhost:5432/csi_gcet_test`;
        const result = validateTargetSafety('csi_gcet_test', url);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_DISALLOWED_USER');
        expect(result.reason).toContain('not in the approved restore roles allowlist');
      }
    });

    it('should approve dedicated restore role csi_migrator (Requirement 1)', () => {
      for (const role of DEFAULT_APPROVED_RESTORE_ROLES) {
        const url = `postgresql://${role}:secret@localhost:5432/csi_gcet_test`;
        const result = validateTargetSafety('csi_gcet_test', url);
        expect(result.valid).toBe(true);
        expect(result.status).toBe('PASSED_EMPTY_TARGET');
      }
    });

    it('should properly redact credentials from database connection URLs (Requirement 1)', () => {
      const urlWithSecret = 'postgresql://csi_migrator:SuperSecret123!@localhost:5432/csi_gcet_test';
      const redacted = redactDatabaseUrl(urlWithSecret);
      expect(redacted).not.toContain('SuperSecret123!');
      expect(redacted).toContain('csi_migrator:***@localhost:5432/csi_gcet_test');
    });

    it('should reject non-standard production database name like csi_gcet_live (Requirement 2)', () => {
      const liveUrl = 'postgresql://csi_migrator:pass@localhost:5432/csi_gcet_live';
      const result = validateTargetSafety('csi_gcet_live', liveUrl);
      expect(result.valid).toBe(false);
      expect(result.status).toBe('REFUSED_PROTECTED_TARGET');
      expect(result.reason).toContain('matches protected environment name pattern ("live")');
    });

    it('should reject restore operations entirely when NODE_ENV is production (Requirement 2)', () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const url = 'postgresql://csi_migrator:pass@localhost:5432/csi_gcet_test';
        const result = validateTargetSafety('csi_gcet_test', url);
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_PRODUCTION_MODE');
        expect(result.reason).toContain('strictly prohibited when NODE_ENV is set to production');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should prevent bypassing safety restrictions through RESTORE_DRILL_APPROVED_TARGETS (Requirement 2)', () => {
      const origCustom = process.env.RESTORE_DRILL_APPROVED_TARGETS;
      try {
        process.env.RESTORE_DRILL_APPROVED_TARGETS = 'csi_gcet_live,csi_gcet_prod,my_custom_live';
        const result = validateTargetSafety('csi_gcet_live', 'postgresql://csi_migrator:pass@localhost:5432/csi_gcet_live');
        expect(result.valid).toBe(false);
        expect(result.status).toBe('REFUSED_PROTECTED_TARGET');
      } finally {
        if (origCustom) {
          process.env.RESTORE_DRILL_APPROVED_TARGETS = origCustom;
        } else {
          delete process.env.RESTORE_DRILL_APPROVED_TARGETS;
        }
      }
    });

    it('should reject missing or malformed connection configuration', () => {
      expect(validateTargetSafety('csi_gcet_test', undefined).status).toBe('INVALID_CONFIG');
      expect(validateTargetSafety('csi_gcet_test', '').status).toBe('INVALID_CONFIG');
      expect(validateTargetSafety('csi_gcet_test', 'not-a-valid-url').status).toBe('INVALID_CONFIG');
    });
  });

  describe('Deep Storage Restoration Verification (Item 3)', () => {
    it('should collect file manifests and perform cryptographic end-to-end verification', () => {
      const storageDir = join(testTmpDir, 'source_storage_test');
      mkdirSync(join(storageDir, 'certificates'), { recursive: true });
      mkdirSync(join(storageDir, 'passports'), { recursive: true });

      writeFileSync(join(storageDir, 'certificates', 'cert_001.pdf'), 'PDF-MOCK-CERT-1');
      writeFileSync(join(storageDir, 'passports', 'passport_001.pdf'), 'PDF-MOCK-PASSPORT-1');

      // 1. Collect manifest
      const manifestEntries = collectStorageManifest(storageDir);
      expect(manifestEntries).toHaveLength(2);
      expect(manifestEntries[0]?.relativePath).toBe('certificates/cert_001.pdf');
      expect(manifestEntries[1]?.relativePath).toBe('passports/passport_001.pdf');
      expect(manifestEntries[0]?.sha256).toHaveLength(64);

      // 2. Verify identical extracted tree passes
      const extractDir = join(testTmpDir, 'extracted_storage_pass');
      mkdirSync(join(extractDir, 'certificates'), { recursive: true });
      mkdirSync(join(extractDir, 'passports'), { recursive: true });
      writeFileSync(join(extractDir, 'certificates', 'cert_001.pdf'), 'PDF-MOCK-CERT-1');
      writeFileSync(join(extractDir, 'passports', 'passport_001.pdf'), 'PDF-MOCK-PASSPORT-1');

      const passResult = verifyExtractedStorage(extractDir, manifestEntries);
      expect(passResult.status).toBe('PASS');
      expect(passResult.checksumMatches).toBe(2);
      expect(passResult.missingFiles).toHaveLength(0);
      expect(passResult.corruptedFiles).toHaveLength(0);
      expect(passResult.unexpectedFiles).toHaveLength(0);

      // 3. Detect corrupted file contents
      const corruptDir = join(testTmpDir, 'extracted_storage_corrupt');
      mkdirSync(join(corruptDir, 'certificates'), { recursive: true });
      mkdirSync(join(corruptDir, 'passports'), { recursive: true });
      writeFileSync(join(corruptDir, 'certificates', 'cert_001.pdf'), 'TAMPERED-CERT-CONTENT');
      writeFileSync(join(corruptDir, 'passports', 'passport_001.pdf'), 'PDF-MOCK-PASSPORT-1');

      const corruptResult = verifyExtractedStorage(corruptDir, manifestEntries);
      expect(corruptResult.status).toBe('FAIL');
      expect(corruptResult.corruptedFiles).toContain('certificates/cert_001.pdf');
      expect(corruptResult.checksumMatches).toBe(1);

      // 4. Detect missing files
      const missingDir = join(testTmpDir, 'extracted_storage_missing');
      mkdirSync(join(missingDir, 'certificates'), { recursive: true });
      writeFileSync(join(missingDir, 'certificates', 'cert_001.pdf'), 'PDF-MOCK-CERT-1');

      const missingResult = verifyExtractedStorage(missingDir, manifestEntries);
      expect(missingResult.status).toBe('FAIL');
      expect(missingResult.missingFiles).toContain('passports/passport_001.pdf');

      // 5. Detect unexpected injected files
      const extraDir = join(testTmpDir, 'extracted_storage_extra');
      mkdirSync(join(extraDir, 'certificates'), { recursive: true });
      mkdirSync(join(extraDir, 'passports'), { recursive: true });
      writeFileSync(join(extraDir, 'certificates', 'cert_001.pdf'), 'PDF-MOCK-CERT-1');
      writeFileSync(join(extraDir, 'passports', 'passport_001.pdf'), 'PDF-MOCK-PASSPORT-1');
      writeFileSync(join(extraDir, 'unexpected_malicious.sh'), 'echo exploit');

      const extraResult = verifyExtractedStorage(extraDir, manifestEntries);
      expect(extraResult.status).toBe('FAIL');
      expect(extraResult.unexpectedFiles).toContain('unexpected_malicious.sh');
    });

    it('should fail manifest collection when encountering an unreadable file (Requirement 6)', () => {
      const storageDir = join(testTmpDir, 'unreadable_test_dir');
      mkdirSync(storageDir, { recursive: true });
      const badFile = join(storageDir, 'locked_file.txt');
      writeFileSync(badFile, 'content');

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs');
      jest.spyOn(fs, 'statSync').mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(() => collectStorageManifest(storageDir)).toThrow(/Failed to read storage file/);
    });

    it('should fail manifest collection when encountering a symbolic link (Requirement 6)', () => {
      const storageDir = join(testTmpDir, 'symlink_test_dir');
      mkdirSync(storageDir, { recursive: true });
      const targetFile = join(storageDir, 'real.txt');
      writeFileSync(targetFile, 'real content');
      const linkFile = join(storageDir, 'link.txt');

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { symlinkSync } = require('node:fs');
        symlinkSync(targetFile, linkFile);
        expect(() => collectStorageManifest(storageDir)).toThrow(/Symbolic link detected/);
      } catch {
        // If system doesn't permit symlink creation in non-elevated Windows environment, verify error handling logic directly
        const mockDirent = {
          name: 'link.txt',
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
          isSocket: () => false,
          isFIFO: () => false,
          isCharacterDevice: () => false,
          isBlockDevice: () => false,
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs');
        jest.spyOn(fs, 'readdirSync').mockReturnValueOnce([mockDirent]);
        expect(() => collectStorageManifest(storageDir)).toThrow(/Symbolic link detected/);
      }
    });

    it('should reject archives containing parent-directory traversal in member paths (Requirement 6)', () => {
      // Mock execFileSync to return tar output with path traversal
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const childProcess = require('node:child_process');
      const fakeTar = join(testTmpDir, 'traversal.tar.gz');
      writeFileSync(fakeTar, 'fake');

      jest.spyOn(childProcess, 'execFileSync').mockReturnValueOnce(Buffer.from('certs/valid.pdf\n../evil.sh\n'));

      const result = validateArchiveMemberPaths(fakeTar);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('Unsafe path traversal ("..")');
    });

    it('should reject archives containing absolute paths in member paths (Requirement 6)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const childProcess = require('node:child_process');
      const fakeTar = join(testTmpDir, 'absolute.tar.gz');
      writeFileSync(fakeTar, 'fake');

      jest.spyOn(childProcess, 'execFileSync').mockReturnValueOnce(Buffer.from('/etc/passwd\n'));

      const result = validateArchiveMemberPaths(fakeTar);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('Unsafe absolute path detected');
    });
  });

  describe('Deep Database Restoration Verification: Foreign Keys & Audit Trigger (Requirements 3 & 4)', () => {
    const mockManifest = {
      backupId: 'drill-mock-01',
      timestamp: new Date().toISOString(),
      sourceDatabase: 'csi_gcet_dev',
      format: 'pg_dump_custom' as const,
      archiveFilename: 'mock.dump',
      archiveSizeBytes: 1024,
      archiveSha256: 'mockhash',
      migrationVersion: '20261109000000_grant_runtime_permissions',
      tableCount: 2,
      tables: ['users', 'audit_log'],
      recordCounts: { users: 5, audit_log: 10 },
      toolVersions: { pgDump: '16.0', node: '20.0', platform: 'win32' },
      verificationStatus: 'VERIFIED' as const,
    };

    function createMockClient(options: {
      tables?: string[];
      migration?: string;
      fks?: Array<{
        constraint_name: string;
        is_validated: boolean;
        match_type?: string;
        src_table: string;
        src_columns?: string[];
        src_column?: string;
        ref_table: string;
        ref_columns?: string[];
        ref_column?: string;
      }>;
      orphanCount?: number;
      failOrphanQuery?: boolean;
      trigger?: {
        trigger_name: string;
        function_name: string;
        enabled_state: string;
        table_name: string;
      } | null;
      userCount?: number;
      auditCount?: number;
    }) {
      const tables = options.tables ?? ['users', 'audit_log', '_prisma_migrations'];
      const migration = options.migration ?? '20261109000000_grant_runtime_permissions';
      const fks = (
        options.fks ?? [
          {
            constraint_name: 'fk_mock_user',
            is_validated: true,
            match_type: 's',
            src_table: 'audit_log',
            src_columns: ['user_id'],
            ref_table: 'users',
            ref_columns: ['id'],
          },
        ]
      ).map((f) => ({
        constraint_name: f.constraint_name,
        is_validated: f.is_validated,
        match_type: f.match_type ?? 's',
        src_table: f.src_table,
        src_columns: f.src_columns ?? (f.src_column ? [f.src_column] : ['user_id']),
        ref_table: f.ref_table,
        ref_columns: f.ref_columns ?? (f.ref_column ? [f.ref_column] : ['id']),
      }));
      const trigger =
        options.trigger !== undefined
          ? options.trigger
          : {
              trigger_name: 'audit_log_immutable_trigger',
              function_name: 'audit_log_prevent_mutation',
              enabled_state: 'O',
              table_name: 'audit_log',
            };

      return {
        query: jest.fn().mockImplementation((queryText: string) => {
          if (queryText.includes('information_schema.tables')) {
            return Promise.resolve({ rows: tables.map((t) => ({ table_name: t })) });
          }
          if (queryText.includes('_prisma_migrations')) {
            return Promise.resolve({ rows: [{ migration_name: migration }] });
          }
          if (queryText.includes('pg_constraint')) {
            return Promise.resolve({ rows: fks });
          }
          if (
            queryText.includes('WHERE (src."user_id" IS NOT NULL)') ||
            queryText.includes('WHERE src."user_id" IS NOT NULL')
          ) {
            if (options.failOrphanQuery) {
              return Promise.reject(new Error('Relation does not exist: mock_error'));
            }
            return Promise.resolve({ rows: [{ count: String(options.orphanCount ?? 0) }] });
          }
          if (queryText.includes('SELECT COUNT(*)::text AS count FROM "users"')) {
            return Promise.resolve({ rows: [{ count: String(options.userCount ?? 5) }] });
          }
          if (queryText.includes('SELECT COUNT(*)::text AS count FROM "audit_log"')) {
            return Promise.resolve({ rows: [{ count: String(options.auditCount ?? 10) }] });
          }
          if (queryText.includes('pg_trigger')) {
            return Promise.resolve({ rows: trigger ? [trigger] : [] });
          }
          return Promise.resolve({ rows: [] });
        }),
      } as unknown as Client;
    }

    it('should pass verification when tables, migrations, foreign keys, and audit trigger match', async () => {
      const client = createMockClient({});
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('PASS');
      expect(report.errors).toHaveLength(0);
      expect(report.foreignKeyCount).toBe(1);
      expect(report.invalidForeignKeys).toHaveLength(0);
      expect(report.orphanedForeignKeys).toBe(0);
      expect(report.triggerIntegrity).toBe(true);
    });

    it('should fail verification when a foreign key constraint is not validated (Requirement 3)', async () => {
      const client = createMockClient({
        fks: [
          {
            constraint_name: 'fk_unvalidated',
            is_validated: false,
            src_table: 'audit_log',
            src_column: 'user_id',
            ref_table: 'users',
            ref_column: 'id',
          },
        ],
      });
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('FAIL');
      expect(report.invalidForeignKeys).toContain('fk_unvalidated');
      expect(report.errors).toContain('Foreign key constraint "fk_unvalidated" is marked NOT VALID.');
    });

    it('should fail verification when orphaned foreign key records exist (Requirement 3)', async () => {
      const client = createMockClient({ orphanCount: 3 });
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('FAIL');
      expect(report.orphanedForeignKeys).toBe(3);
      expect(report.errors.some((e) => e.includes('Detected 3 orphaned record(s)'))).toBe(true);
    });

    it('should fail verification if any foreign key integrity query fails (Requirement 3)', async () => {
      const client = createMockClient({ failOrphanQuery: true });
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('FAIL');
      expect(report.errors.some((e) => e.includes('Referential integrity check failed'))).toBe(true);
    });

    it('should fail verification when audit_log trigger is missing (Requirement 4)', async () => {
      const client = createMockClient({ trigger: null });
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('FAIL');
      expect(report.triggerIntegrity).toBe(false);
      expect(report.errors).toContain(
        'Required append-only trigger "audit_log_immutable_trigger" missing on table "audit_log".',
      );
    });

    it('should fail verification when audit_log trigger is attached to wrong function (Requirement 4)', async () => {
      const client = createMockClient({
        trigger: {
          trigger_name: 'audit_log_immutable_trigger',
          function_name: 'unexpected_function',
          enabled_state: 'O',
          table_name: 'audit_log',
        },
      });
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('FAIL');
      expect(report.triggerIntegrity).toBe(false);
      expect(report.errors.some((e) => e.includes('unexpected function "unexpected_function"'))).toBe(true);
    });

    it('should fail verification when audit_log trigger is disabled (Requirement 4)', async () => {
      const client = createMockClient({
        trigger: {
          trigger_name: 'audit_log_immutable_trigger',
          function_name: 'audit_log_prevent_mutation',
          enabled_state: 'D', // Disabled
          table_name: 'audit_log',
        },
      });
      const report = await verifyRestoredDatabase(client, mockManifest);
      expect(report.status).toBe('FAIL');
      expect(report.triggerIntegrity).toBe(false);
      expect(report.errors.some((e) => e.includes('is not enabled'))).toBe(true);
    });
  });

  describe('Foreign Key Integrity Query Builder & Composite Keys (Requirement 1)', () => {
    it('should build correct SQL query for single-column foreign key under MATCH SIMPLE', () => {
      const fk = {
        constraintName: 'fk_users_role',
        isValidated: true,
        matchType: 's',
        srcTable: 'users',
        refTable: 'roles',
        srcColumns: ['role_id'],
        refColumns: ['id'],
      };
      const query = buildForeignKeyIntegrityQuery(fk);
      expect(query).toBe(
        'SELECT COUNT(*)::text AS count FROM "users" src LEFT JOIN "roles" ref ON src."role_id" = ref."id" WHERE (src."role_id" IS NOT NULL) AND ref."id" IS NULL;',
      );
    });

    it('should build correct SQL query for composite foreign key under MATCH SIMPLE', () => {
      const fk = {
        constraintName: 'fk_composite_test',
        isValidated: true,
        matchType: 's',
        srcTable: 'attendance_records',
        refTable: 'attendance_sessions',
        srcColumns: ['event_id', 'session_id'],
        refColumns: ['event_id', 'id'],
      };
      const query = buildForeignKeyIntegrityQuery(fk);
      expect(query).toBe(
        'SELECT COUNT(*)::text AS count FROM "attendance_records" src LEFT JOIN "attendance_sessions" ref ON src."event_id" = ref."event_id" AND src."session_id" = ref."id" WHERE (src."event_id" IS NOT NULL AND src."session_id" IS NOT NULL) AND ref."event_id" IS NULL;',
      );
    });

    it('should build correct SQL query for composite foreign key under MATCH FULL', () => {
      const fk = {
        constraintName: 'fk_match_full_composite',
        isValidated: true,
        matchType: 'f',
        srcTable: 'roster_entries',
        refTable: 'committees',
        srcColumns: ['org_id', 'committee_id'],
        refColumns: ['org_id', 'id'],
      };
      const query = buildForeignKeyIntegrityQuery(fk);
      expect(query).toContain(
        'WHERE ((src."org_id" IS NULL OR src."committee_id" IS NULL) AND (src."org_id" IS NOT NULL OR src."committee_id" IS NOT NULL)) OR ((src."org_id" IS NOT NULL AND src."committee_id" IS NOT NULL) AND ref."org_id" IS NULL);',
      );
    });

    it('should reject invalid foreign key column length mismatch', () => {
      const fk = {
        constraintName: 'fk_invalid_cols',
        isValidated: true,
        matchType: 's',
        srcTable: 't1',
        refTable: 't2',
        srcColumns: ['c1', 'c2'],
        refColumns: ['c1'],
      };
      expect(() => buildForeignKeyIntegrityQuery(fk)).toThrow(/Invalid foreign key column definition/);
    });

    it('should verify referential integrity with composite foreign keys in restored database', async () => {
      const client = {
        query: jest.fn().mockImplementation((q: string) => {
          if (q.includes('information_schema.tables')) {
            return Promise.resolve({
              rows: [{ table_name: 'attendance_records' }, { table_name: '_prisma_migrations' }],
            });
          }
          if (q.includes('_prisma_migrations')) {
            return Promise.resolve({ rows: [{ migration_name: '20261109000000_grant_runtime_permissions' }] });
          }
          if (q.includes('pg_constraint')) {
            return Promise.resolve({
              rows: [
                {
                  constraint_name: 'fk_composite_att',
                  is_validated: true,
                  match_type: 's',
                  src_table: 'attendance_records',
                  ref_table: 'attendance_sessions',
                  src_columns: ['event_id', 'session_id'],
                  ref_columns: ['event_id', 'id'],
                },
              ],
            });
          }
          if (q.includes('COUNT(*)::text AS count FROM "attendance_records" src')) {
            return Promise.resolve({ rows: [{ count: '0' }] });
          }
          return Promise.resolve({ rows: [] });
        }),
      } as unknown as Client;

      const manifest = {
        backupId: 'drill-composite-01',
        timestamp: new Date().toISOString(),
        sourceDatabase: 'csi_gcet_dev',
        format: 'pg_dump_custom' as const,
        archiveFilename: 'mock.dump',
        archiveSizeBytes: 1024,
        archiveSha256: 'mockhash',
        migrationVersion: '20261109000000_grant_runtime_permissions',
        tableCount: 1,
        tables: ['attendance_records'],
        recordCounts: {},
        toolVersions: { pgDump: '16.0', node: '20.0', platform: 'win32' },
        verificationStatus: 'VERIFIED' as const,
      };

      const report = await verifyRestoredDatabase(client, manifest);
      expect(report.status).toBe('PASS');
      expect(report.foreignKeyCount).toBe(1);
      expect(report.orphanedForeignKeys).toBe(0);
    });
  });

  describe('Archive Extraction Hardening Against Symlinks & Hardlinks (Requirement 2)', () => {
    it('should reject tar archives containing symbolic links in member entries', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const childProcess = require('node:child_process');
      const fakeTar = join(testTmpDir, 'symlink.tar.gz');
      writeFileSync(fakeTar, 'fake');

      // Verbose mode listing with 'l' prefix and '->' target
      jest
        .spyOn(childProcess, 'execFileSync')
        .mockReturnValueOnce(
          Buffer.from('lrwxrwxrwx 0 0 0 Jan 01 00:00 certs/symlink.pdf -> /etc/passwd\n'),
        );

      const result = validateArchiveMemberPaths(fakeTar);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('symbolic links are forbidden');
    });

    it('should reject tar archives containing hard links in member entries', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const childProcess = require('node:child_process');
      const fakeTar = join(testTmpDir, 'hardlink.tar.gz');
      writeFileSync(fakeTar, 'fake');

      // Verbose mode listing with 'h' prefix or 'link to'
      jest
        .spyOn(childProcess, 'execFileSync')
        .mockReturnValueOnce(
          Buffer.from('hrw-r--r-- 0 0 0 Jan 01 00:00 certs/hardlink.pdf link to certs/real.pdf\n'),
        );

      const result = validateArchiveMemberPaths(fakeTar);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('hard links are forbidden');
    });

    it('should reject tar archives containing device nodes or FIFO special files', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const childProcess = require('node:child_process');
      const fakeTar = join(testTmpDir, 'device.tar.gz');
      writeFileSync(fakeTar, 'fake');

      jest
        .spyOn(childProcess, 'execFileSync')
        .mockReturnValueOnce(
          Buffer.from('crw-rw-rw- 0 0 0 Jan 01 00:00 dev/null\n'),
        );

      const result = validateArchiveMemberPaths(fakeTar);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('special device/FIFO/socket files are forbidden');
    });

    it('verifyNoSymlinksOrEscapes should pass for a clean directory', () => {
      const cleanDir = join(testTmpDir, 'clean_extracted');
      mkdirSync(cleanDir, { recursive: true });
      writeFileSync(join(cleanDir, 'file.txt'), 'clean content');

      const result = verifyNoSymlinksOrEscapes(cleanDir);
      expect(result.safe).toBe(true);
    });

    it('verifyNoSymlinksOrEscapes should reject directory containing symbolic links', () => {
      const symlinkDir = join(testTmpDir, 'symlink_extracted');
      mkdirSync(symlinkDir, { recursive: true });
      writeFileSync(join(symlinkDir, 'target.txt'), 'target content');

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs');
      const mockLstat = {
        isSymbolicLink: () => true,
        isDirectory: () => false,
        isFile: () => false,
        isSocket: () => false,
        isFIFO: () => false,
        isCharacterDevice: () => false,
        isBlockDevice: () => false,
      };

      jest.spyOn(fs, 'readdirSync').mockReturnValueOnce(['bad_symlink.txt']);
      jest.spyOn(fs, 'lstatSync').mockReturnValueOnce(mockLstat);

      const result = verifyNoSymlinksOrEscapes(symlinkDir);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('Unsafe symbolic link detected');
    });
  });

  describe('PostgreSQL Role Attributes & Privileges Validation (Requirement 3)', () => {
    it('should reject PostgreSQL superusers (rolsuper=true) by catalog attribute', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              current_user: 'postgres',
              is_superuser: true,
              can_login: true,
              has_connect: true,
              has_schema_usage: true,
              has_schema_create: true,
            },
          ],
        }),
      } as unknown as Client;

      const result = await verifyRestoreRolePrivileges(mockClient, new Set(['postgres']));
      expect(result.valid).toBe(false);
      expect(result.isSuperuser).toBe(true);
      expect(result.error).toContain('has superuser attribute (rolsuper=true)');
    });

    it('should reject application runtime role lacking schema CREATE privilege (csi_app)', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              current_user: 'csi_app',
              is_superuser: false,
              can_login: true,
              has_connect: true,
              has_schema_usage: true,
              has_schema_create: false, // csi_app lacks CREATE privilege on public schema
            },
          ],
        }),
      } as unknown as Client;

      const result = await verifyRestoreRolePrivileges(mockClient, new Set(['csi_app']));
      expect(result.valid).toBe(false);
      expect(result.hasSchemaCreate).toBe(false);
      expect(result.error).toContain('lacks required schema privileges');
    });

    it('should reject unexpected login roles outside allowlist', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              current_user: 'unexpected_role',
              is_superuser: false,
              can_login: true,
              has_connect: true,
              has_schema_usage: true,
              has_schema_create: true,
            },
          ],
        }),
      } as unknown as Client;

      const result = await verifyRestoreRolePrivileges(mockClient, new Set(['csi_migrator']));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('is not in approved restore roles allowlist');
    });

    it('should accept approved restore role with required attributes and privileges (csi_migrator)', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              current_user: 'csi_migrator',
              is_superuser: false,
              can_login: true,
              has_connect: true,
              has_schema_usage: true,
              has_schema_create: true,
            },
          ],
        }),
      } as unknown as Client;

      const result = await verifyRestoreRolePrivileges(mockClient, new Set(['csi_migrator']));
      expect(result.valid).toBe(true);
      expect(result.isSuperuser).toBe(false);
      expect(result.canLogin).toBe(true);
      expect(result.hasConnect).toBe(true);
      expect(result.hasSchemaUsage).toBe(true);
      expect(result.hasSchemaCreate).toBe(true);
    });
  });

  describe('Migration Lifecycle Disposability Safety Gate (Requirement 5)', () => {
    it('should strictly refuse migration lifecycle test in production mode (NODE_ENV=production)', () => {
      const result = validateMigrationLifecycleSafety('csi_gcet_test', {
        NODE_ENV: 'production',
        TEST_DATABASE_DISPOSABLE: 'true',
      });
      expect(result.valid).toBe(false);
      expect(result.status).toBe('REFUSED_PRODUCTION');
      expect(result.error).toContain('strictly prohibited in production mode');
    });

    it('should strictly refuse non-test database targets (e.g. csi_gcet_dev, csi_gcet_prod)', () => {
      const result = validateMigrationLifecycleSafety('csi_gcet_dev', {
        TEST_DATABASE_DISPOSABLE: 'true',
      });
      expect(result.valid).toBe(false);
      expect(result.status).toBe('REFUSED_NON_TEST_DB');
      expect(result.error).toContain('Target MUST be strictly "csi_gcet_test"');
    });

    it('should strictly refuse execution if TEST_DATABASE_DISPOSABLE is not explicitly set', () => {
      const result = validateMigrationLifecycleSafety('csi_gcet_test', {});
      expect(result.valid).toBe(false);
      expect(result.status).toBe('REFUSED_NOT_DISPOSABLE');
      expect(result.error).toContain('not explicitly confirmed as disposable');
    });

    it('should permit migration lifecycle test when target is csi_gcet_test and TEST_DATABASE_DISPOSABLE=true', () => {
      const result = validateMigrationLifecycleSafety('csi_gcet_test', {
        TEST_DATABASE_DISPOSABLE: 'true',
      });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('PERMITTED');
    });

    it('should permit migration lifecycle test when ALLOW_DESTRUCTIVE_DOWN_TESTING=true', () => {
      const result = validateMigrationLifecycleSafety('csi_gcet_test', {
        ALLOW_DESTRUCTIVE_DOWN_TESTING: 'true',
      });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('PERMITTED');
    });
  });

  describe('Archive Extraction Security Audit: Adversarial Attack Cases (Gate 1)', () => {
    function createTarBuffer(
      entries: Array<{
        name: string;
        content?: Buffer | string;
        typeflag?: string;
        linkname?: string;
        prefix?: string;
        badChecksum?: boolean | string;
      }>,
    ): Buffer {
      const blocks: Buffer[] = [];
      for (const entry of entries) {
        const rawContent = Buffer.isBuffer(entry.content)
          ? entry.content
          : Buffer.from(entry.content || '');
        const size = entry.typeflag === '5' ? 0 : rawContent.length;

        const hdr = Buffer.alloc(512);
        hdr.write(entry.name, 0, 100, 'utf8');
        hdr.write('0000644 \0', 100, 8, 'utf8');
        hdr.write('0001750 \0', 108, 8, 'utf8');
        hdr.write('0001750 \0', 116, 8, 'utf8');
        const sizeOctal = size.toString(8).padStart(11, '0') + ' ';
        hdr.write(sizeOctal, 124, 12, 'utf8');
        hdr.write('14000000000 ', 136, 12, 'utf8');
        hdr.write(entry.typeflag || '0', 156, 1, 'utf8');
        if (entry.linkname) {
          hdr.write(entry.linkname, 157, 100, 'utf8');
        }
        hdr.write('ustar\0', 257, 6, 'utf8');
        hdr.write('00', 263, 2, 'utf8');
        if (entry.prefix) {
          hdr.write(entry.prefix, 345, 155, 'utf8');
        }

        if (entry.badChecksum) {
          const badVal = typeof entry.badChecksum === 'string' ? entry.badChecksum : '9999999\0';
          hdr.write(badVal, 148, 8, 'utf8');
        } else {
          const chksum = calculateTarHeaderChecksum(hdr);
          const chksumOctal = chksum.unsigned.toString(8).padStart(6, '0') + '\0 ';
          hdr.write(chksumOctal, 148, 8, 'utf8');
        }

        blocks.push(hdr);

        if (size > 0) {
          const contentBlocks = Math.ceil(size / 512);
          const dataBuf = Buffer.alloc(contentBlocks * 512);
          rawContent.copy(dataBuf, 0);
          blocks.push(dataBuf);
        }
      }

      // Two 512-byte blocks of zeroes (EOF)
      blocks.push(Buffer.alloc(1024));
      return Buffer.concat(blocks);
    }

    it('should reject archive entries containing null bytes in path', () => {
      const res = validateSafeArchiveMemberPath('certs/cert_01.pdf\0evil.exe');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsafe characters or control codes');
    });

    it('should reject archive entries containing newlines or carriage returns in path', () => {
      const res1 = validateSafeArchiveMemberPath('certs/\nevil.sh');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Unsafe characters or control codes');

      const res2 = validateSafeArchiveMemberPath('certs/sub\r\nevil.sh');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Unsafe characters or control codes');
    });

    it('should reject archive entries containing ANSI escape sequences or control characters', () => {
      const res = validateSafeArchiveMemberPath('certs/\x1b[2Jevil.sh');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsafe characters or control codes');
    });

    it('should reject Windows drive letter paths', () => {
      const res1 = validateSafeArchiveMemberPath('C:/Windows/System32/evil.dll');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Unsafe absolute path detected');

      const res2 = validateSafeArchiveMemberPath('d:\\evil.txt');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Unsafe absolute path detected');
    });

    it('should reject Windows UNC paths', () => {
      const res1 = validateSafeArchiveMemberPath('//attacker-server/share/evil.sh');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Unsafe absolute path detected');

      const res2 = validateSafeArchiveMemberPath('\\\\attacker\\share\\evil.sh');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Unsafe absolute path detected');
    });

    it('should reject Windows device paths and reserved DOS device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)', () => {
      expect(validateSafeArchiveMemberPath('certs/CON').valid).toBe(false);
      expect(validateSafeArchiveMemberPath('certs/prn.txt').valid).toBe(false);
      expect(validateSafeArchiveMemberPath('passports/aux.pdf').valid).toBe(false);
      expect(validateSafeArchiveMemberPath('nul').valid).toBe(false);
      expect(validateSafeArchiveMemberPath('com1/file.txt').valid).toBe(false);
      expect(validateSafeArchiveMemberPath('lpt9.log').valid).toBe(false);
    });

    it('should reject path segments with trailing dots or spaces', () => {
      const res1 = validateSafeArchiveMemberPath('certs./evil.pdf');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Unsafe trailing dot or space');

      const res2 = validateSafeArchiveMemberPath('certs /evil.pdf');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Unsafe trailing dot or space');
    });

    it('should reject binary tar archives containing symbolic links', () => {
      const tarBuf = createTarBuffer([
        { name: 'symlink.txt', typeflag: '2', linkname: '../../etc/passwd' },
      ]);
      const result = parseAndValidateTarArchive(tarBuf);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('symbolic links are forbidden');
    });

    it('should reject binary tar archives containing hard links', () => {
      const tarBuf = createTarBuffer([
        { name: 'hardlink.txt', typeflag: '1', linkname: 'target.txt' },
      ]);
      const result = parseAndValidateTarArchive(tarBuf);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('hard links are forbidden');
    });

    it('should reject binary tar archives containing character/block devices or FIFOs', () => {
      const charDevTar = createTarBuffer([{ name: 'dev_null', typeflag: '3' }]);
      expect(parseAndValidateTarArchive(charDevTar).safe).toBe(false);

      const blockDevTar = createTarBuffer([{ name: 'dev_disk', typeflag: '4' }]);
      expect(parseAndValidateTarArchive(blockDevTar).safe).toBe(false);

      const fifoTar = createTarBuffer([{ name: 'pipe', typeflag: '6' }]);
      expect(parseAndValidateTarArchive(fifoTar).safe).toBe(false);
    });

    it('should reject binary tar archives containing duplicate file entries', () => {
      const tarBuf = createTarBuffer([
        { name: 'certs/cert1.pdf', content: 'content 1' },
        { name: 'certs/cert1.pdf', content: 'content 2 (injected duplicate)' },
      ]);
      const result = parseAndValidateTarArchive(tarBuf);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('duplicate file path detected');
    });

    it('should reject binary tar archives containing file and directory type collisions', () => {
      const tarBuf = createTarBuffer([
        { name: 'certs', content: 'regular file named certs' },
        { name: 'certs/sub.pdf', content: 'file inside certs dir' },
      ]);
      const result = parseAndValidateTarArchive(tarBuf);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('collides with previously defined');
    });

    it('safeExtractStorageArchive should extract valid tar into isolated directory', () => {
      const tarBuf = createTarBuffer([
        { name: 'docs/hello.txt', content: 'Hello World!' },
        { name: 'docs/sub/sample.txt', content: 'Subdirectory content' },
      ]);
      const tarPath = join(testTmpDir, 'valid_test.tar');
      writeFileSync(tarPath, tarBuf);

      const destDir = join(testTmpDir, 'extracted_safe_' + randomUUID().slice(0, 8));
      const res = safeExtractStorageArchive(tarPath, destDir);
      expect(res.success).toBe(true);
      expect(res.extractedFiles).toContain('docs/hello.txt');
      expect(res.extractedFiles).toContain('docs/sub/sample.txt');

      // Verify files actually exist on disk
      expect(readFileSync(join(destDir, 'docs', 'hello.txt'), 'utf8')).toBe('Hello World!');
    });

    it('safeExtractStorageArchive should fail closed and refuse to overwrite pre-existing files', () => {
      const destDir = join(testTmpDir, 'no_overwrite_' + randomUUID().slice(0, 8));
      mkdirSync(join(destDir, 'docs'), { recursive: true });
      writeFileSync(join(destDir, 'docs', 'existing.txt'), 'ORIGINAL USER DATA');

      // Archive attempting to overwrite existing.txt
      const maliciousTar = createTarBuffer([
        { name: 'docs/existing.txt', content: 'OVERWRITTEN MALICIOUS DATA' },
      ]);
      const tarPath = join(testTmpDir, 'overwrite_attempt.tar');
      writeFileSync(tarPath, maliciousTar);

      const res = safeExtractStorageArchive(tarPath, destDir);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();

      // Ensure original data was preserved intact
      expect(readFileSync(join(destDir, 'docs', 'existing.txt'), 'utf8')).toBe('ORIGINAL USER DATA');
    });

    it('should verify tar header checksums and reject corrupted headers', () => {
      // 1. Valid checksum
      const validTar = createTarBuffer([
        { name: 'valid.txt', content: 'hello world' },
      ]);
      const validRes = parseAndValidateTarArchive(validTar);
      expect(validRes.safe).toBe(true);

      // 2. Corrupted checksum
      const corruptTar = createTarBuffer([
        { name: 'corrupt.txt', content: 'hello world', badChecksum: '000001\0' },
      ]);
      const corruptRes = parseAndValidateTarArchive(corruptTar);
      expect(corruptRes.safe).toBe(false);
      expect(corruptRes.error).toContain('checksum mismatch');
    });

    it('should correctly parse PAX attributes and reject linkpath injections', () => {
      // 1. Positive attribute parsing (length is total record length including len digits and newline)
      const samplePax = '24 path=docs/custom.txt\n13 size=1024\n';
      const parsed = parsePaxAttributes(samplePax);
      expect(parsed.path).toBe('docs/custom.txt');
      expect(parsed.size).toBe('1024');

      // 2. Truncated or malformed PAX data does not crash or loop infinitely
      const malformedPax = '99999 path=truncated';
      const safeParsed = parsePaxAttributes(malformedPax);
      expect(typeof safeParsed).toBe('object');

      // 3. PAX header attempting linkpath injection
      const paxLinkRecord = '24 linkpath=/etc/shadow\n';
      const paxTar = createTarBuffer([
        { name: 'pax_global_header', typeflag: 'x', content: paxLinkRecord },
        { name: 'innocent.txt', content: 'dummy' },
      ]);
      const paxRes = parseAndValidateTarArchive(paxTar);
      expect(paxRes.safe).toBe(false);
      expect(paxRes.error).toContain('PAX linkpath detected');
    });

    it('should enforce archive member limits and single-file size limits', () => {
      expect(MAX_ARCHIVE_MEMBER_COUNT).toBe(5000);
      expect(MAX_DECOMPRESSED_ARCHIVE_BYTES).toBe(250 * 1024 * 1024);
      expect(MAX_SINGLE_FILE_BYTES).toBe(50 * 1024 * 1024);

      // 1. Single file size limit guard
      const oversizedHdr = Buffer.alloc(512);
      oversizedHdr.write('oversized.bin', 0, 100, 'utf8');
      oversizedHdr.write('0000644 \0', 100, 8, 'utf8');
      // Set size larger than MAX_SINGLE_FILE_BYTES (50MB)
      const oversized = (MAX_SINGLE_FILE_BYTES + 1024).toString(8).padStart(11, '0') + ' ';
      oversizedHdr.write(oversized, 124, 12, 'utf8');
      oversizedHdr.write('ustar\0', 257, 6, 'utf8');
      const chksum = calculateTarHeaderChecksum(oversizedHdr);
      oversizedHdr.write(chksum.unsigned.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');
      const oversizedTar = Buffer.concat([oversizedHdr, Buffer.alloc(1024)]);

      const oversizeRes = parseAndValidateTarArchive(oversizedTar);
      expect(oversizeRes.safe).toBe(false);
      expect(oversizeRes.error).toContain('exceeds maximum single-file safety limit');
    });

    it('should support valid gzip archives and reject corrupted or bomb-like gzip archives', () => {
      // 1. Valid gzipped tar archive
      const validTar = createTarBuffer([{ name: 'test.txt', content: 'inside gzip' }]);
      const gzippedTar = gzipSync(validTar);
      const validGzRes = parseAndValidateTarArchive(gzippedTar);
      expect(validGzRes.safe).toBe(true);
      expect(validGzRes.entries[0]?.path).toBe('test.txt');

      // 2. Gzip magic number with corrupted stream
      const corruptGzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x01, 0x02]);
      const res = parseAndValidateTarArchive(corruptGzip);
      expect(res.safe).toBe(false);
      expect(res.error).toContain('Corrupted gzip archive or decompression limit exceeded');
    });
  });
});
