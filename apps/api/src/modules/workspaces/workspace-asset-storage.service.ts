import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { resolve, join, normalize, extname } from 'path';
import { createHash } from 'crypto';
import { ErrorCode } from '@csi/shared';

export interface SavedAssetFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
  mimeType: string;
}

@Injectable()
export class WorkspaceAssetStorageService {
  private readonly storageRoot: string;
  private readonly maxFileSizeBytes = 10 * 1024 * 1024; // 10 MB limit (RR:SEC-09)

  constructor() {
    const cwd = process.cwd();
    const candidateRoot = resolve(cwd, 'apps/api/storage/workspaces/assets');
    const candidateApp = resolve(cwd, 'storage/workspaces/assets');

    if (existsSync(resolve(cwd, 'apps/api'))) {
      this.storageRoot = candidateRoot;
    } else {
      this.storageRoot = candidateApp;
    }

    if (!existsSync(this.storageRoot)) {
      mkdirSync(this.storageRoot, { recursive: true });
    }
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
   * Persists an asset file to disk in a committee-jailed folder.
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
    const committeeDir = normalize(join(this.storageRoot, committeeId));

    if (!committeeDir.startsWith(this.storageRoot)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Path traversal attempt detected in committee storage directory.',
      });
    }

    if (!existsSync(committeeDir)) {
      mkdirSync(committeeDir, { recursive: true });
    }

    const fileNameOnDisk = `${assetId}_${sanitizedName}`;
    const targetFile = normalize(join(committeeDir, fileNameOnDisk));

    if (!targetFile.startsWith(committeeDir)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Path traversal attempt detected in target file path.',
      });
    }

    writeFileSync(targetFile, fileBuffer);

    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
    const relativeStoragePath = `${committeeId}/${fileNameOnDisk}`;

    return {
      storagePath: relativeStoragePath,
      fileHash,
      fileSizeBytes: fileBuffer.length,
      mimeType: verifiedMimeType,
    };
  }

  /**
   * Reads an asset file buffer from disk verifying path jail.
   */
  async getAssetFile(storagePath: string): Promise<Buffer> {
    const absolutePath = normalize(join(this.storageRoot, storagePath));

    if (!absolutePath.startsWith(this.storageRoot)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid asset storage path.',
      });
    }

    if (!existsSync(absolutePath)) {
      throw new NotFoundException({
        code: ErrorCode.ASSET_FILE_UNAVAILABLE,
        message: 'Asset file not found in storage.',
      });
    }

    return readFileSync(absolutePath);
  }

  /**
   * Verifies file existence on disk.
   */
  hasAssetFile(storagePath?: string | null): boolean {
    if (!storagePath) return false;
    const absolutePath = normalize(join(this.storageRoot, storagePath));
    return absolutePath.startsWith(this.storageRoot) && existsSync(absolutePath);
  }

  /**
   * Deletes an asset file from disk.
   */
  async deleteAssetFile(storagePath?: string | null): Promise<void> {
    if (!storagePath) return;
    const absolutePath = normalize(join(this.storageRoot, storagePath));
    if (absolutePath.startsWith(this.storageRoot) && existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }
  }
}
