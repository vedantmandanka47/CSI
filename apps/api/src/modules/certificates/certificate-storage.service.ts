import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { resolve, join, normalize } from 'path';
import { createHash } from 'crypto';

export interface SavedCertificateFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
}

@Injectable()
export class CertificateStorageService {
  private readonly logger = new Logger(CertificateStorageService.name);
  private readonly storageRoot: string;

  constructor() {
    const cwd = process.cwd();
    const candidateRoot = resolve(cwd, 'apps/api/storage/certificates');
    const candidateApp = resolve(cwd, 'storage/certificates');

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
   * Persists a rendered PDF buffer to disk with SHA-256 integrity hash.
   */
  async saveCertificatePdf(
    certificateId: string,
    pdfBuffer: Buffer,
    batchId?: string,
  ): Promise<SavedCertificateFile> {
    if (!/^[a-zA-Z0-9_\-]+$/.test(certificateId)) {
      throw new BadRequestException('Invalid certificate ID for storage path.');
    }

    const subDir = batchId && /^[a-zA-Z0-9_\-]+$/.test(batchId) ? batchId : 'direct';
    const targetDir = normalize(join(this.storageRoot, subDir));

    if (!targetDir.startsWith(this.storageRoot)) {
      throw new BadRequestException('Path traversal attempt detected.');
    }

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = normalize(join(targetDir, `${certificateId}.pdf`));
    if (!targetFile.startsWith(this.storageRoot)) {
      throw new BadRequestException('Path traversal attempt detected.');
    }

    writeFileSync(targetFile, pdfBuffer);

    const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');
    const relativePath = join(subDir, `${certificateId}.pdf`).replace(/\\/g, '/');

    return {
      storagePath: relativePath,
      fileHash,
      fileSizeBytes: pdfBuffer.length,
    };
  }

  /**
   * Reads a stored certificate PDF buffer from disk verifying path jail.
   */
  async getCertificatePdf(storagePath: string): Promise<Buffer> {
    const absolutePath = normalize(join(this.storageRoot, storagePath));

    if (!absolutePath.startsWith(this.storageRoot)) {
      throw new BadRequestException('Invalid certificate storage path.');
    }

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Certificate PDF file not found in storage.');
    }

    return readFileSync(absolutePath);
  }

  /**
   * Checks if certificate file exists in storage.
   */
  hasCertificatePdf(storagePath?: string | null): boolean {
    if (!storagePath) return false;
    const absolutePath = normalize(join(this.storageRoot, storagePath));
    return absolutePath.startsWith(this.storageRoot) && existsSync(absolutePath);
  }

  /**
   * Deletes a certificate PDF from storage.
   */
  async deleteCertificatePdf(storagePath: string): Promise<void> {
    const absolutePath = normalize(join(this.storageRoot, storagePath));
    if (absolutePath.startsWith(this.storageRoot) && existsSync(absolutePath)) {
      try {
        unlinkSync(absolutePath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to delete storage file ${absolutePath}: ${msg}`);
      }
    }
  }
}
