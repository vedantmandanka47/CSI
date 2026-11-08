import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { createHash } from 'crypto';
import { env } from '../../config/env.js';
import { IStorageProvider, StoragePutOptions } from './storage-provider.interface.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { S3StorageProvider } from './s3-storage.provider.js';

@Injectable()
export class StorageService implements IStorageProvider {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: IStorageProvider;
  private readonly driverName: 'local' | 's3';

  constructor() {
    this.driverName = (env.STORAGE_DRIVER as 'local' | 's3') || 'local';

    if (this.driverName === 's3') {
      this.logger.log(`Initializing StorageService with S3 driver (bucket: ${env.S3_BUCKET}, region: ${env.S3_REGION})`);
      this.provider = new S3StorageProvider({
        bucket: env.S3_BUCKET || '',
        region: env.S3_REGION || '',
        endpoint: env.S3_ENDPOINT,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      });
    } else {
      this.logger.log('Initializing StorageService with LocalStorageProvider');
      this.provider = new LocalStorageProvider(env.STORAGE_ROOT_DIR);
    }
  }

  getDriverName(): 'local' | 's3' {
    return this.driverName;
  }

  getProvider(): IStorageProvider {
    return this.provider;
  }

  /**
   * Computes SHA-256 hash of a binary buffer.
   */
  calculateSha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  async put(key: string, buffer: Buffer, options?: StoragePutOptions): Promise<void> {
    return this.provider.put(key, buffer, options);
  }

  async get(key: string): Promise<Buffer> {
    return this.provider.get(key);
  }

  async putStream(key: string, stream: NodeJS.ReadableStream | Readable, options?: StoragePutOptions): Promise<void> {
    return this.provider.putStream(key, stream, options);
  }

  async getStream(key: string): Promise<Readable> {
    return this.provider.getStream(key);
  }

  async delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  async getSignedUrl(key: string, expiresInSec: number = 3600): Promise<string> {
    return this.provider.getSignedUrl(key, expiresInSec);
  }

  /**
   * Synchronous check for callers that require instant local disk presence check.
   */
  existsLocalSync(key: string): boolean {
    if (this.provider instanceof LocalStorageProvider) {
      return this.provider.existsLocalSync(key);
    }
    return false;
  }
}

