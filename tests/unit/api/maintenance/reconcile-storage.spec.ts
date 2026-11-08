import { existsSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  scanDirectoryRecursive,
  reconcileStorage,
  resolveStorageRoot,
  DiscoveredFile,
} from '../../../../scripts/maintenance/reconcile-storage.js';
import { PrismaClient } from '@prisma/client';

type MockPrismaClient = {
  committeeAsset: {
    findMany: jest.Mock;
  };
  certificate: {
    findMany: jest.Mock;
  };
  passport: {
    findMany: jest.Mock;
  };
  $disconnect: jest.Mock;
};

describe('Storage Reconciliation Maintenance Engine (TASK-028 / HR-010 / F39)', () => {
  let tempStorageDir: string;
  let mockPrisma: MockPrismaClient;

  beforeEach(() => {
    tempStorageDir = join(tmpdir(), `csi-storage-test-${randomUUID()}`);
    mkdirSync(tempStorageDir, { recursive: true });

    mockPrisma = {
      committeeAsset: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      certificate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      passport: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    try {
      if (existsSync(tempStorageDir)) {
        rmSync(tempStorageDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore directory cleanup failure in tempdir
    }
  });

  describe('scanDirectoryRecursive', () => {
    it('should recursively scan files and ignore .gitkeep, .gitignore and quarantine directory', () => {
      const subDir = join(tempStorageDir, 'subfolder');
      const quarantineDir = join(tempStorageDir, 'quarantine');
      mkdirSync(subDir, { recursive: true });
      mkdirSync(quarantineDir, { recursive: true });

      writeFileSync(join(tempStorageDir, '.gitkeep'), '');
      writeFileSync(join(tempStorageDir, '.gitignore'), '');
      writeFileSync(join(quarantineDir, 'quarantined-file.pdf'), 'quarantine-content');
      writeFileSync(join(subDir, 'valid-file.png'), 'valid-content');
      writeFileSync(join(subDir, 'file.tmp.12345'), 'temp-content');

      const files = scanDirectoryRecursive(tempStorageDir);

      expect(files).toHaveLength(2);
      const relPaths = files.map((f: DiscoveredFile) => f.relativePath);
      expect(relPaths).toContain('subfolder/valid-file.png');
      expect(relPaths).toContain('subfolder/file.tmp.12345');
      expect(relPaths).not.toContain('.gitkeep');
      expect(relPaths).not.toContain('quarantine/quarantined-file.pdf');

      const tempFile = files.find((f: DiscoveredFile) => f.relativePath === 'subfolder/file.tmp.12345');
      expect(tempFile?.isTempFile).toBe(true);
    });
  });

  describe('resolveStorageRoot', () => {
    it('should prioritize explicit override directory', () => {
      const explicit = join(tempStorageDir, 'custom-root');
      expect(resolveStorageRoot(explicit)).toBe(explicit);
    });
  });

  describe('reconcileStorage — Dry Run', () => {
    it('should report orphans, missing files, and stale temp files without altering files', async () => {
      const assetDir = join(tempStorageDir, 'workspaces', 'assets', 'comm-1');
      const certDir = join(tempStorageDir, 'certificates', 'batch-1');
      const passDir = join(tempStorageDir, 'passports');
      mkdirSync(assetDir, { recursive: true });
      mkdirSync(certDir, { recursive: true });
      mkdirSync(passDir, { recursive: true });

      // Valid files on disk matching DB
      const validAssetPath = join(assetDir, 'asset-valid.png');
      writeFileSync(validAssetPath, 'asset-bytes');
      mockPrisma.committeeAsset.findMany.mockResolvedValue([
        { storagePath: 'comm-1/asset-valid.png' },
        { storagePath: 'comm-1/missing-asset.png' }, // Missing on disk!
      ]);

      // Orphaned certificate on disk (not in DB)
      const orphanCertPath = join(certDir, 'cert-orphan.pdf');
      writeFileSync(orphanCertPath, 'orphan-bytes');
      mockPrisma.certificate.findMany.mockResolvedValue([]);

      // Stale temp file (> 15 minutes old)
      const staleTempPath = join(passDir, 'passport.tmp.999');
      writeFileSync(staleTempPath, 'temp-bytes');
      const twentyMinsAgo = (Date.now() - 20 * 60 * 1000) / 1000;
      utimesSync(staleTempPath, twentyMinsAgo, twentyMinsAgo);

      // Active fresh temp file (< 5 minutes old)
      const freshTempPath = join(passDir, 'fresh.tmp.111');
      writeFileSync(freshTempPath, 'fresh-bytes');

      const report = await reconcileStorage(
        {
          mode: 'dry-run',
          storageRootDir: tempStorageDir,
          silent: true,
        },
        mockPrisma as unknown as PrismaClient,
      );

      expect(report.mode).toBe('dry-run');
      expect(report.totalOrphanedFiles).toBe(1); // orphan cert
      expect(report.totalMissingFiles).toBe(1); // missing asset in DB
      expect(report.totalStaleTempFiles).toBe(1); // stale passport.tmp
      expect(report.totalFreedBytes).toBe(0); // Dry-run does not alter files

      // Verify files still exist on disk
      expect(existsSync(orphanCertPath)).toBe(true);
      expect(existsSync(staleTempPath)).toBe(true);
      expect(existsSync(freshTempPath)).toBe(true);
      expect(existsSync(validAssetPath)).toBe(true);
    });
  });

  describe('reconcileStorage — Quarantine Mode', () => {
    it('should move orphaned files to quarantine directory leaving valid files intact', async () => {
      const assetDir = join(tempStorageDir, 'workspaces', 'assets', 'comm-1');
      mkdirSync(assetDir, { recursive: true });

      const validAsset = join(assetDir, 'valid.png');
      const orphanAsset = join(assetDir, 'orphan.png');
      writeFileSync(validAsset, 'valid');
      writeFileSync(orphanAsset, 'orphan');

      mockPrisma.committeeAsset.findMany.mockResolvedValue([
        { storagePath: 'comm-1/valid.png' },
      ]);

      const report = await reconcileStorage(
        {
          mode: 'quarantine',
          storageRootDir: tempStorageDir,
          silent: true,
        },
        mockPrisma as unknown as PrismaClient,
      );

      expect(report.mode).toBe('quarantine');
      expect(report.totalOrphanedFiles).toBe(1);

      // Orphan moved to quarantine
      expect(existsSync(orphanAsset)).toBe(false);
      const quarantinedPath = join(tempStorageDir, 'quarantine', 'workspaces', 'assets', 'comm-1', 'orphan.png');
      expect(existsSync(quarantinedPath)).toBe(true);

      // Valid file untouched
      expect(existsSync(validAsset)).toBe(true);
    });
  });

  describe('reconcileStorage — Prune Mode', () => {
    it('should delete orphaned files and stale temp files while preserving valid and active files', async () => {
      const certDir = join(tempStorageDir, 'certificates', 'batch-1');
      mkdirSync(certDir, { recursive: true });

      const validCert = join(certDir, 'cert-valid.pdf');
      const orphanCert = join(certDir, 'cert-orphan.pdf');
      const staleTemp = join(certDir, 'stale.tmp.123');
      const freshTemp = join(certDir, 'fresh.tmp.456');

      writeFileSync(validCert, 'valid-cert');
      writeFileSync(orphanCert, 'orphan-cert');
      writeFileSync(staleTemp, 'stale-temp');
      writeFileSync(freshTemp, 'fresh-temp');

      const twentyMinsAgo = (Date.now() - 20 * 60 * 1000) / 1000;
      utimesSync(staleTemp, twentyMinsAgo, twentyMinsAgo);

      mockPrisma.certificate.findMany.mockResolvedValue([
        { storagePath: 'batch-1/cert-valid.pdf' },
      ]);

      const report = await reconcileStorage(
        {
          mode: 'prune',
          storageRootDir: tempStorageDir,
          silent: true,
        },
        mockPrisma as unknown as PrismaClient,
      );

      expect(report.mode).toBe('prune');
      expect(report.totalOrphanedFiles).toBe(1);
      expect(report.totalStaleTempFiles).toBe(1);
      expect(report.totalFreedBytes).toBeGreaterThan(0);

      // Orphan and stale temp deleted
      expect(existsSync(orphanCert)).toBe(false);
      expect(existsSync(staleTemp)).toBe(false);

      // Valid cert and active fresh temp preserved
      expect(existsSync(validCert)).toBe(true);
      expect(existsSync(freshTemp)).toBe(true);
    });
  });
});
