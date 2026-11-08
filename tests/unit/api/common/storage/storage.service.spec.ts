import { promises as fsPromises } from 'fs';
import { join, basename } from 'path';
import { Readable } from 'stream';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocalStorageProvider } from '../../../../../apps/api/src/common/storage/local-storage.provider.js';
import { S3StorageProvider } from '../../../../../apps/api/src/common/storage/s3-storage.provider.js';
import { StorageService } from '../../../../../apps/api/src/common/storage/storage.service.js';
import { CertificateStorageService } from '../../../../../apps/api/src/modules/certificates/storage/certificate-storage.service.js';
import { PassportStorageService } from '../../../../../apps/api/src/modules/passports/services/passport-storage.service.js';
import { WorkspaceAssetStorageService } from '../../../../../apps/api/src/modules/workspaces/workspace-asset-storage.service.js';

describe('Storage System (TASK-027 / B16 / HR-002)', () => {
  const cwd = process.cwd();
  const testRoot =
    cwd.endsWith('apps/api') || cwd.endsWith('apps\\api') || basename(cwd) === 'api'
      ? join(cwd, 'storage/test_storage_tmp')
      : join(cwd, 'apps/api/storage/test_storage_tmp');

  beforeAll(async () => {
    await fsPromises.mkdir(testRoot, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fsPromises.rm(testRoot, { recursive: true, force: true });
    } catch {
      // Ignored: test root cleanup
    }
  });

  describe('LocalStorageProvider', () => {
    let provider: LocalStorageProvider;

    beforeEach(() => {
      provider = new LocalStorageProvider(testRoot);
    });

    it('atomically puts and gets binary buffer data', async () => {
      const key = 'test-sub/file-1.txt';
      const content = Buffer.from('Storage durability test payload');

      await provider.put(key, content);

      const exists = await provider.exists(key);
      expect(exists).toBe(true);

      const retrieved = await provider.get(key);
      expect(retrieved.toString()).toBe('Storage durability test payload');

      // Verify no temporary files remain in directory
      const dirFiles = await fsPromises.readdir(join(testRoot, 'test-sub'));
      expect(dirFiles).toContain('file-1.txt');
      expect(dirFiles.some((f) => f.includes('.tmp.'))).toBe(false);
    });

    it('streams data into and out of storage', async () => {
      const key = 'test-sub/stream-file.txt';
      const content = 'Streamed data content line 1\nLine 2';
      const inStream = Readable.from([content]);

      await provider.putStream(key, inStream);

      const exists = await provider.exists(key);
      expect(exists).toBe(true);

      const outStream = await provider.getStream(key);
      const chunks: Buffer[] = [];
      for await (const chunk of outStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe(content);
    });

    it('deletes stored file cleanly and reports existence accurately', async () => {
      const key = 'test-sub/to-delete.txt';
      await provider.put(key, Buffer.from('temporary to delete'));

      expect(await provider.exists(key)).toBe(true);
      expect(provider.existsLocalSync(key)).toBe(true);

      await provider.delete(key);

      expect(await provider.exists(key)).toBe(false);
      expect(provider.existsLocalSync(key)).toBe(false);

      // Deleting non-existent file does not throw
      await expect(provider.delete(key)).resolves.not.toThrow();
    });

    it('throws NotFoundException when retrieving non-existent file', async () => {
      await expect(provider.get('non-existent-key.txt')).rejects.toThrow(NotFoundException);
      await expect(provider.getStream('non-existent-key.txt')).rejects.toThrow(NotFoundException);
    });

    it('strictly enforces path jail containment against directory traversal', async () => {
      const traversalKey1 = '../../etc/passwd';
      const traversalKey2 = 'sub/../../../shadow';

      await expect(provider.put(traversalKey1, Buffer.from('bad'))).rejects.toThrow(BadRequestException);
      await expect(provider.get(traversalKey1)).rejects.toThrow(BadRequestException);
      await expect(provider.delete(traversalKey2)).rejects.toThrow(BadRequestException);
      await expect(provider.exists(traversalKey1)).rejects.toThrow(BadRequestException);
    });

    it('generates local signed URL path format', async () => {
      const url = await provider.getSignedUrl('certificates/direct/cert-123.pdf');
      expect(url).toBe('/api/storage/certificates/direct/cert-123.pdf');
    });
  });

  describe('S3StorageProvider', () => {
    it('requires bucket and region in configuration', () => {
      expect(() => new S3StorageProvider({ bucket: '', region: 'ap-south-1' })).toThrow(BadRequestException);
      expect(() => new S3StorageProvider({ bucket: 'my-bucket', region: '' })).toThrow(BadRequestException);
    });

    it('generates AWS SigV4 presigned URL with query authentication credentials', async () => {
      const s3 = new S3StorageProvider({
        bucket: 'test-bucket',
        region: 'ap-south-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });

      const signedUrl = await s3.getSignedUrl('certificates/cert-456.pdf', 1800);

      expect(signedUrl).toContain('https://test-bucket.s3.ap-south-1.amazonaws.com/certificates/cert-456.pdf?');
      expect(signedUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(signedUrl).toContain('X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F');
      expect(signedUrl).toContain('X-Amz-Expires=1800');
      expect(signedUrl).toContain('X-Amz-Signature=');
    });

    it('supports custom S3 endpoints with path-style access (MinIO, R2)', async () => {
      const s3 = new S3StorageProvider({
        bucket: 'minio-bucket',
        region: 'us-east-1',
        endpoint: 'http://localhost:9000',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      });

      const signedUrl = await s3.getSignedUrl('workspaces/assets/logo.png', 3600);

      expect(signedUrl).toContain('http://localhost:9000/minio-bucket/workspaces/assets/logo.png?');
      expect(signedUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(signedUrl).toContain('X-Amz-Credential=minioadmin%2F');
    });

    it('performs S3 HTTP operations with mocked fetch responses', async () => {
      const s3 = new S3StorageProvider({
        bucket: 'test-bucket',
        region: 'ap-south-1',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });

      const originalFetch = globalThis.fetch;
      try {
        // Mock PUT
        globalThis.fetch = jest.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
        await expect(s3.put('remote-file.txt', Buffer.from('hello s3'))).resolves.not.toThrow();

        // Mock GET
        globalThis.fetch = jest.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () => Buffer.from('hello s3 content'),
        });
        const retrieved = await s3.get('remote-file.txt');
        expect(retrieved.toString()).toBe('hello s3 content');

        // Mock HEAD (exists: true)
        globalThis.fetch = jest.fn().mockResolvedValueOnce({
          status: 200,
        });
        expect(await s3.exists('remote-file.txt')).toBe(true);

        // Mock HEAD (exists: false on 404)
        globalThis.fetch = jest.fn().mockResolvedValueOnce({
          status: 404,
        });
        expect(await s3.exists('missing.txt')).toBe(false);

        // Mock DELETE
        globalThis.fetch = jest.fn().mockResolvedValueOnce({
          ok: true,
          status: 204,
        });
        await expect(s3.delete('remote-file.txt')).resolves.not.toThrow();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('StorageService (Global Service)', () => {
    let service: StorageService;

    beforeEach(() => {
      service = new StorageService();
    });

    it('defaults to LocalStorageProvider in default configuration', () => {
      expect(service.getDriverName()).toBe('local');
      expect(service.getProvider()).toBeInstanceOf(LocalStorageProvider);
    });

    it('computes correct SHA-256 hex digest for buffers', () => {
      const testBuffer = Buffer.from('CSI GCET Student Branch Platform');
      const hash = service.calculateSha256(testBuffer);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('delegates put, get, and exists operations to active provider', async () => {
      const key = 'service-test/data.json';
      const payload = Buffer.from(JSON.stringify({ status: 'ok', version: 1 }));

      await service.put(key, payload);
      expect(await service.exists(key)).toBe(true);

      const retrieved = await service.get(key);
      expect(JSON.parse(retrieved.toString()).status).toBe('ok');

      await service.delete(key);
      expect(await service.exists(key)).toBe(false);
    });
  });

  describe('Domain Storage Services Integration', () => {
    let storageService: StorageService;

    beforeEach(() => {
      storageService = new StorageService();
    });

    it('CertificateStorageService saves and retrieves PDFs with atomic durability and integrity verification', async () => {
      const certStorage = new CertificateStorageService(storageService);
      const dummyPdf = Buffer.from('%PDF-1.4 CSI Merit Certificate Valid Buffer');

      const saved = await certStorage.saveCertificatePdf('cert-durability-01', dummyPdf, 'batch-99');
      expect(saved.storagePath).toContain('cert-durability-01.pdf');
      expect(saved.fileSizeBytes).toBe(dummyPdf.length);

      // Verify integrity check
      const isAuthentic = await certStorage.verifyFileIntegrity(saved.storagePath, saved.fileHash);
      expect(isAuthentic).toBe(true);

      const isMismatched = await certStorage.verifyFileIntegrity(saved.storagePath, '0000000000000000000000000000000000000000000000000000000000000000');
      expect(isMismatched).toBe(false);

      // Verify retrieval
      const buffer = await certStorage.getCertificatePdf(saved.storagePath);
      expect(buffer.toString()).toBe(dummyPdf.toString());

      // Cleanup
      await certStorage.deleteCertificatePdf(saved.storagePath);
      expect(certStorage.hasCertificatePdf(saved.storagePath)).toBe(false);
    });

    it('PassportStorageService saves and retrieves passports with atomic durability', async () => {
      const passportStorage = new PassportStorageService(storageService);
      const dummyPassport = Buffer.from('%PDF-1.4 CSI Student Activity Passport Content');

      const saved = await passportStorage.savePassportPdf('passport-durability-01', dummyPassport);
      expect(saved.storagePath).toBe('passport-durability-01.pdf');

      const isAuthentic = await passportStorage.verifyFileIntegrity(saved.storagePath, saved.fileHash);
      expect(isAuthentic).toBe(true);

      const buffer = await passportStorage.getPassportPdf(saved.storagePath);
      expect(buffer.toString()).toBe(dummyPassport.toString());

      await passportStorage.deletePassportPdf(saved.storagePath);
      expect(passportStorage.hasPassportPdf(saved.storagePath)).toBe(false);
    });

    it('WorkspaceAssetStorageService validates format, enforces path jail, and saves assets atomically', async () => {
      const assetStorage = new WorkspaceAssetStorageService(storageService);

      // Valid PNG header (89 50 4E 47)
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

      const saved = await assetStorage.saveAssetFile('technical', 'asset-durability-01', 'banner.png', validPng);
      expect(saved.mimeType).toBe('image/png');
      expect(saved.storagePath).toContain('technical/asset-durability-01_banner.png');

      const buffer = await assetStorage.getAssetFile(saved.storagePath);
      expect(buffer.length).toBe(validPng.length);

      await assetStorage.deleteAssetFile(saved.storagePath);
      expect(assetStorage.hasAssetFile(saved.storagePath)).toBe(false);
    });
  });
});
