import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { resolve, join, normalize } from 'path';
import { createHash } from 'crypto';

export interface SavedPassportFile {
  storagePath: string;
  fileHash: string;
  fileSizeBytes: number;
}

@Injectable()
export class PassportStorageService {
  private readonly storageRoot: string;

  constructor() {
    const cwd = process.cwd();
    const candidateRoot = resolve(cwd, 'apps/api/storage/passports');
    const candidateApp = resolve(cwd, 'storage/passports');

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
   * Persists a rendered passport PDF buffer to disk with SHA-256 integrity hash.
   */
  async savePassportPdf(
    passportId: string,
    pdfBuffer: Buffer,
  ): Promise<SavedPassportFile> {
    if (!/^[a-zA-Z0-9_-]+$/.test(passportId)) {
      throw new BadRequestException('Invalid passport ID for storage path.');
    }

    const targetFile = normalize(join(this.storageRoot, `${passportId}.pdf`));
    if (!targetFile.startsWith(this.storageRoot)) {
      throw new BadRequestException('Path traversal attempt detected.');
    }

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
    const absolutePath = normalize(join(this.storageRoot, storagePath));

    if (!absolutePath.startsWith(this.storageRoot)) {
      throw new BadRequestException('Invalid passport storage path.');
    }

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
    const absolutePath = normalize(join(this.storageRoot, storagePath));
    return absolutePath.startsWith(this.storageRoot) && existsSync(absolutePath);
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
    const absolutePath = normalize(join(this.storageRoot, storagePath));
    if (!absolutePath.startsWith(this.storageRoot)) {
      throw new BadRequestException('Invalid passport storage path.');
    }

    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
      return true;
    }
    return false;
  }
}
