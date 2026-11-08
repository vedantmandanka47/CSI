import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { resolveStorageDirectory, assertPathContained } from '../../../common/storage/storage-path.util.js';
import { IStorageProvider } from '../../../common/storage/storage-provider.interface.js';
import { LocalStorageProvider } from '../../../common/storage/local-storage.provider.js';
import { StorageService } from '../../../common/storage/storage.service.js';

export interface SavedCertificateFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
}

@Injectable()
export class CertificateStorageService {
  private readonly logger = new Logger(CertificateStorageService.name);
  private readonly storageRoot: string;
  private readonly storage: IStorageProvider;

  constructor(@Optional() private readonly storageService?: StorageService) {
    this.storageRoot = resolveStorageDirectory('certificates');
    this.storage = storageService ?? new LocalStorageProvider(this.storageRoot);
  }

  private getStorageKey(relativePath: string): string {
    const sanitized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (this.storageService) {
      return `certificates/${sanitized}`;
    }
    return sanitized;
  }

  /**
   * Persists a rendered PDF buffer to storage with SHA-256 integrity hash and atomic write.
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
    const relativePath = `${subDir}/${certificateId}.pdf`;
    const key = this.getStorageKey(relativePath);

    // Validate path containment against jail
    assertPathContained(relativePath, '.', 'Invalid certificate storage path.');

    await this.storage.put(key, pdfBuffer, { contentType: 'application/pdf' });

    const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');

    return {
      storagePath: relativePath,
      fileHash,
      fileSizeBytes: pdfBuffer.length,
    };
  }

  /**
   * Reads a stored certificate PDF buffer from storage verifying path jail.
   */
  async getCertificatePdf(storagePath: string): Promise<Buffer> {
    assertPathContained(storagePath, '.', 'Invalid certificate storage path.');
    const key = this.getStorageKey(storagePath);

    try {
      return await this.storage.get(key);
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        throw new NotFoundException('Certificate PDF file not found in storage.');
      }
      throw err;
    }
  }

  /**
   * Checks if certificate file exists in storage.
   */
  hasCertificatePdf(storagePath?: string | null): boolean {
    if (!storagePath) return false;
    try {
      assertPathContained(storagePath, '.', 'Invalid certificate storage path.');
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
   * Verifies that the stored PDF file exists and its SHA-256 hash matches the expected database hash.
   */
  async verifyFileIntegrity(storagePath: string, expectedHash: string): Promise<boolean> {
    try {
      const buffer = await this.getCertificatePdf(storagePath);
      const actualHash = createHash('sha256').update(buffer).digest('hex');
      return actualHash.toLowerCase() === expectedHash.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Deletes a certificate PDF from storage.
   */
  async deleteCertificatePdf(storagePath: string): Promise<void> {
    try {
      assertPathContained(storagePath, '.', 'Invalid certificate storage path.');
    } catch {
      return;
    }
    const key = this.getStorageKey(storagePath);
    try {
      await this.storage.delete(key);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to delete certificate storage key ${key}: ${msg}`);
    }
  }
}
