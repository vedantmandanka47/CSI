import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { resolveStorageDirectory, assertPathContained } from '../../../common/storage/storage-path.util.js';
import { IStorageProvider } from '../../../common/storage/storage-provider.interface.js';
import { LocalStorageProvider } from '../../../common/storage/local-storage.provider.js';
import { StorageService } from '../../../common/storage/storage.service.js';

export interface SavedPassportFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
}

@Injectable()
export class PassportStorageService {
  private readonly storageRoot: string;
  private readonly storage: IStorageProvider;

  constructor(@Optional() private readonly storageService?: StorageService) {
    this.storageRoot = resolveStorageDirectory('passports');
    this.storage = storageService ?? new LocalStorageProvider(this.storageRoot);
  }

  private getStorageKey(relativePath: string): string {
    const sanitized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (this.storageService) {
      return `passports/${sanitized}`;
    }
    return sanitized;
  }

  /**
   * Persists a rendered passport PDF buffer to storage with SHA-256 integrity hash and atomic write.
   */
  async savePassportPdf(
    passportId: string,
    pdfBuffer: Buffer,
  ): Promise<SavedPassportFile> {
    if (!/^[a-zA-Z0-9_-]+$/.test(passportId)) {
      throw new BadRequestException('Invalid passport ID for storage path.');
    }

    const relativePath = `${passportId}.pdf`;
    assertPathContained(relativePath, '.', 'Invalid passport storage path.');
    const key = this.getStorageKey(relativePath);

    await this.storage.put(key, pdfBuffer, { contentType: 'application/pdf' });

    const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');

    return {
      storagePath: relativePath,
      fileHash,
      fileSizeBytes: pdfBuffer.length,
    };
  }

  /**
   * Reads a stored passport PDF buffer from storage verifying path jail.
   */
  async getPassportPdf(storagePath: string): Promise<Buffer> {
    assertPathContained(storagePath, '.', 'Invalid passport storage path.');
    const key = this.getStorageKey(storagePath);

    try {
      return await this.storage.get(key);
    } catch (err: unknown) {
      if (err instanceof NotFoundException) {
        throw new NotFoundException('Passport PDF file not found in storage.');
      }
      throw err;
    }
  }

  /**
   * Checks if passport file exists in storage.
   */
  hasPassportPdf(storagePath?: string | null): boolean {
    if (!storagePath) return false;
    try {
      assertPathContained(storagePath, '.', 'Invalid passport storage path.');
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
  async verifyFileIntegrity(
    storagePath: string,
    expectedHash: string,
  ): Promise<boolean> {
    if (!this.hasPassportPdf(storagePath)) {
      return false;
    }

    try {
      const buffer = await this.getPassportPdf(storagePath);
      const computedHash = createHash('sha256').update(buffer).digest('hex');
      return computedHash === expectedHash;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a passport PDF from storage (e.g. for testing or cleanup).
   */
  async deletePassportPdf(storagePath: string): Promise<boolean> {
    try {
      assertPathContained(storagePath, '.', 'Invalid passport storage path.');
    } catch {
      return false;
    }
    const key = this.getStorageKey(storagePath);
    try {
      await this.storage.delete(key);
      return true;
    } catch {
      return false;
    }
  }
}
