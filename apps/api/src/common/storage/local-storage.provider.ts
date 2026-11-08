import { promises as fsPromises, createReadStream, createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { join, dirname, normalize, resolve } from 'path';
import { randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { IStorageProvider, StoragePutOptions } from './storage-provider.interface.js';
import { assertPathContained, isPathContained, resolveStorageDirectory } from './storage-path.util.js';

export class LocalStorageProvider implements IStorageProvider {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ? normalize(resolve(rootDir)) : resolveStorageDirectory('');
    if (!existsSync(this.rootDir)) {
      // Synchronous creation for initial constructor bootstrapping
      try {
        fsPromises.mkdir(this.rootDir, { recursive: true }).catch(() => {});
      } catch {
        // Ignored: best-effort directory creation
      }
    }
  }

  getRootDir(): string {
    return this.rootDir;
  }

  private resolveKeyPath(key: string): string {
    const rawTarget = join(this.rootDir, key);
    return assertPathContained(rawTarget, this.rootDir, `Storage path traversal detected for key '${key}'.`);
  }

  /**
   * Atomically writes a binary buffer using a temporary file in the same directory,
   * then atomically renaming it to the final target path.
   */
  async put(key: string, buffer: Buffer, _options?: StoragePutOptions): Promise<void> {
    const targetPath = this.resolveKeyPath(key);
    const targetDir = dirname(targetPath);
    await fsPromises.mkdir(targetDir, { recursive: true });

    const tempPath = `${targetPath}.tmp.${randomUUID()}`;

    try {
      await fsPromises.writeFile(tempPath, buffer);
      await fsPromises.rename(tempPath, targetPath);
    } catch (err: unknown) {
      try {
        await fsPromises.unlink(tempPath);
      } catch {
        // Ignored: best-effort temp cleanup
      }
      throw err;
    }
  }

  /**
   * Reads a binary buffer from local storage.
   */
  async get(key: string): Promise<Buffer> {
    const targetPath = this.resolveKeyPath(key);
    try {
      return await fsPromises.readFile(targetPath);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') {
        throw new NotFoundException(`File not found in storage: '${key}'.`);
      }
      throw err;
    }
  }

  /**
   * Atomically writes a stream to disk using a temporary file and atomic rename.
   */
  async putStream(key: string, stream: NodeJS.ReadableStream | Readable, _options?: StoragePutOptions): Promise<void> {
    const targetPath = this.resolveKeyPath(key);
    const targetDir = dirname(targetPath);
    await fsPromises.mkdir(targetDir, { recursive: true });

    const tempPath = `${targetPath}.tmp.${randomUUID()}`;
    const writeStream = createWriteStream(tempPath);

    try {
      await pipeline(stream as Readable, writeStream);
      await fsPromises.rename(tempPath, targetPath);
    } catch (err: unknown) {
      try {
        await fsPromises.unlink(tempPath);
      } catch {
        // Ignored: best-effort temp cleanup
      }
      throw err;
    }
  }

  /**
   * Reads a stream from local storage.
   */
  async getStream(key: string): Promise<Readable> {
    const targetPath = this.resolveKeyPath(key);
    try {
      await fsPromises.access(targetPath);
    } catch {
      throw new NotFoundException(`File not found in storage: '${key}'.`);
    }
    return createReadStream(targetPath);
  }

  /**
   * Deletes a file from local storage.
   */
  async delete(key: string): Promise<void> {
    const targetPath = this.resolveKeyPath(key);
    try {
      await fsPromises.unlink(targetPath);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Checks whether a file exists in local storage asynchronously.
   */
  async exists(key: string): Promise<boolean> {
    const targetPath = this.resolveKeyPath(key);
    try {
      await fsPromises.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Synchronous existence check helper for non-async callers.
   */
  existsLocalSync(key: string): boolean {
    try {
      const rawTarget = join(this.rootDir, key);
      return isPathContained(rawTarget, this.rootDir) && existsSync(rawTarget);
    } catch {
      return false;
    }
  }

  /**
   * Generates a local access URL for the given key.
   */
  async getSignedUrl(key: string, _expiresInSec: number = 3600): Promise<string> {
    const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    return `/api/storage/${normalizedKey}`;
  }
}
