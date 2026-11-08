import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { extname } from 'path';
import { createHash } from 'crypto';
import { ErrorCode, MAX_ASSET_FILE_SIZE_BYTES } from '@csi/shared';
import { resolveStorageDirectory, assertPathContained } from '../../common/storage/storage-path.util.js';
import { IStorageProvider } from '../../common/storage/storage-provider.interface.js';
import { LocalStorageProvider } from '../../common/storage/local-storage.provider.js';
import { StorageService } from '../../common/storage/storage.service.js';

export interface SavedAssetFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
  mimeType: string;
}

@Injectable()
export class WorkspaceAssetStorageService {
  private readonly storageRoot: string;
  private readonly maxFileSizeBytes = MAX_ASSET_FILE_SIZE_BYTES; // 10 MB limit (RR:SEC-09)
  private readonly storage: IStorageProvider;

  constructor(@Optional() private readonly storageService?: StorageService) {
    this.storageRoot = resolveStorageDirectory('workspaces/assets');
    this.storage = storageService ?? new LocalStorageProvider(this.storageRoot);
  }

  private getStorageKey(relativePath: string): string {
    const sanitized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (this.storageService) {
      return `workspaces/assets/${sanitized}`;
    }
    return sanitized;
  }

  /**
   * Validate file buffer headers and format integrity (magic bytes)
   */
  validateFormat(buffer: Buffer, originalFileName: string, declaredMimeType?: string): string {
    if (buffer.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Uploaded file cannot be empty',
      });
    }

    if (buffer.length > this.maxFileSizeBytes) {
      throw new BadRequestException({
        code: ErrorCode.ASSET_FILE_TOO_LARGE,
        message: `File exceeds maximum allowed size of 10 MB (${buffer.length} bytes)`,
      });
    }

    const ext = extname(originalFileName).toLowerCase();

    // PNG: 89 50 4E 47
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return 'image/png';
    }

    // JPEG: FF D8 FF
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    // PDF: %PDF- (25 50 44 46 2D)
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return 'application/pdf';
    }

    // WEBP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'image/webp';
    }

    // SVG: <svg
    if (ext === '.svg' || declaredMimeType === 'image/svg+xml') {
      const headerStr = buffer.slice(0, 1024).toString('utf-8');
      if (headerStr.includes('<svg') || headerStr.includes('<?xml')) {
        return 'image/svg+xml';
      }
    }

    // Text / Markdown
    if (['.txt', '.md', '.markdown', '.json'].includes(ext)) {
      return ext === '.md' || ext === '.markdown' ? 'text/markdown' : 'text/plain';
    }

    if (declaredMimeType && declaredMimeType.startsWith('text/')) {
      return declaredMimeType;
    }

    throw new BadRequestException({
      code: ErrorCode.ASSET_INVALID_TYPE,
      message: `Unsupported file format for '${originalFileName}'. Supported formats: PNG, JPEG, WEBP, PDF, SVG, TXT, MD.`,
    });
  }

  /**
   * Persists an asset file to storage in a committee-jailed folder with atomic writes.
   */
  async saveAssetFile(
    committeeId: string,
    assetId: string,
    originalFileName: string,
    fileBuffer: Buffer,
    declaredMimeType?: string,
  ): Promise<SavedAssetFile> {
    const verifiedMimeType = this.validateFormat(fileBuffer, originalFileName, declaredMimeType);

    // Sanitize committeeId and assetId to block traversal
    if (!/^[a-zA-Z0-9_-]+$/.test(committeeId) || !/^[a-zA-Z0-9_-]+$/.test(assetId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid committee or asset identifier for storage path.',
      });
    }

    // Sanitize original file name
    const sanitizedName = originalFileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const fileNameOnDisk = `${assetId}_${sanitizedName}`;
    const relativeStoragePath = `${committeeId}/${fileNameOnDisk}`;

    assertPathContained(relativeStoragePath, '.', 'Path traversal attempt detected in target file path.');

    const key = this.getStorageKey(relativeStoragePath);
    await this.storage.put(key, fileBuffer, { contentType: verifiedMimeType });

    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

    return {
      storagePath: relativeStoragePath,
      fileHash,
      fileSizeBytes: fileBuffer.length,
      mimeType: verifiedMimeType,
    };
  }

  /**
   * Reads an asset file buffer from storage verifying path jail.
   */
  async getAssetFile(storagePath: string): Promise<Buffer> {
    assertPathContained(storagePath, '.', 'Invalid asset storage path.');
    const key = this.getStorageKey(storagePath);

    try {
      return await this.storage.get(key);
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        throw new NotFoundException({
          code: ErrorCode.ASSET_FILE_UNAVAILABLE,
          message: 'Asset file not found in storage.',
        });
      }
      throw err;
    }
  }

  /**
   * Verifies file existence in storage.
   */
  hasAssetFile(storagePath?: string | null): boolean {
    if (!storagePath) return false;
    try {
      assertPathContained(storagePath, '.', 'Invalid asset storage path.');
    } catch {
      return false;
    }
    const key = this.getStorageKey(storagePath);
    if (this.storage instanceof LocalStorageProvider) {
      return this.storage.existsLocalSync(key);
    }
    if (this.storageService) {
      return this.storageService.existsLocalSync(key);
    }
    return false;
  }

  /**
   * Deletes an asset file from storage.
   */
  async deleteAssetFile(storagePath?: string | null): Promise<void> {
    if (!storagePath) return;
    try {
      assertPathContained(storagePath, '.', 'Invalid asset storage path.');
    } catch {
      return;
    }
    const key = this.getStorageKey(storagePath);
    try {
      await this.storage.delete(key);
    } catch {
      // Ignored: best-effort deletion of unreferenced assets
    }
  }
}
