import { Readable } from 'stream';

export interface StoragePutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface IStorageProvider {
  /**
   * Writes binary data buffer to storage under the given key.
   */
  put(key: string, buffer: Buffer, options?: StoragePutOptions): Promise<void>;

  /**
   * Reads binary data buffer from storage for the given key.
   */
  get(key: string): Promise<Buffer>;

  /**
   * Writes a readable stream to storage under the given key.
   */
  putStream(key: string, stream: NodeJS.ReadableStream | Readable, options?: StoragePutOptions): Promise<void>;

  /**
   * Reads a readable stream from storage for the given key.
   */
  getStream(key: string): Promise<Readable>;

  /**
   * Deletes the file stored under the given key.
   */
  delete(key: string): Promise<void>;

  /**
   * Checks whether an object exists under the given key.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Generates a signed or accessible direct URL for the given key.
   */
  getSignedUrl(key: string, expiresInSec?: number): Promise<string>;
}

