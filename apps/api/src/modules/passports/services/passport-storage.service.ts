import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { resolveStorageDirectory, assertPathContained, isPathContained } from '../../../common/storage/storage-path.util.js';

export interface SavedPassportFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
}

@Injectable()
export class PassportStorageService {
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot = resolveStorageDirectory('passports');
  }

  /**
   * Persists a rendered passport PDF buffer to disk with SHA-256 integrity hash.
   */
  async savePassportPdf(
    passportId: string,
    pdfBuffer: Buffer,
  ): Promise<SavedPassportFile> {
    if (!/^[a-zA-Z0-9_-]+$/.test(passportId)) {
      throw new BadRequestException('Invalid passport ID for storage path.');
    }

    const targetFile = assertPathContained(
      join(this.storageRoot, `${passportId}.pdf`),
      this.storageRoot,
    );

    writeFileSync(targetFile, pdfBuffer);

    const fileHash = createHash('sha256').update(pdfBuffer).digest('hex');
    const relativePath = `${passportId}.pdf`;

    return {
      storagePath: relativePath,
      fileHash,
      fileSizeBytes: pdfBuffer.length,
    };
  }

  /**
   * Reads a stored passport PDF buffer from disk verifying path jail.
   */
  async getPassportPdf(storagePath: string): Promise<Buffer> {
    const absolutePath = assertPathContained(
      join(this.storageRoot, storagePath),
      this.storageRoot,
      'Invalid passport storage path.',
    );

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Passport PDF file not found in storage.');
    }

    return readFileSync(absolutePath);
  }

  /**
   * Checks if passport file exists in storage.
   */
  hasPassportPdf(storagePath?: string | null): boolean {
    if (!storagePath) return false;
    const absolutePath = join(this.storageRoot, storagePath);
    return isPathContained(absolutePath, this.storageRoot) && existsSync(absolutePath);
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
    const absolutePath = assertPathContained(
      join(this.storageRoot, storagePath),
      this.storageRoot,
      'Invalid passport storage path.',
    );

    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
      return true;
    }
    return false;
  }
}
