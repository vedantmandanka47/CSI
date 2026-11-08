import { Readable } from 'stream';
import { createHmac, createHash } from 'crypto';
import { NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { IStorageProvider, StoragePutOptions } from './storage-provider.interface.js';

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export class S3StorageProvider implements IStorageProvider {
  private readonly bucket: string;
  private readonly region: string;
  private readonly endpoint: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly forcePathStyle: boolean;

  constructor(config: S3StorageConfig) {
    if (!config.bucket) {
      throw new BadRequestException('S3 storage driver requires S3_BUCKET to be configured.');
    }
    if (!config.region) {
      throw new BadRequestException('S3 storage driver requires S3_REGION to be configured.');
    }

    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint || `https://s3.${config.region}.amazonaws.com`;
    this.accessKeyId = config.accessKeyId || '';
    this.secretAccessKey = config.secretAccessKey || '';
    this.forcePathStyle = config.forcePathStyle ?? Boolean(config.endpoint && !config.endpoint.includes('amazonaws.com'));
  }

  private sanitizeKey(key: string): string {
    return key.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  /**
   * Resolves the full URL endpoint and Host header for a given S3 key.
   */
  private resolveUrlAndHost(key: string): { url: URL; host: string; path: string } {
    const sanitized = this.sanitizeKey(key);
    const baseEndpoint = this.endpoint.endsWith('/') ? this.endpoint.slice(0, -1) : this.endpoint;

    let targetUrl: URL;
    let path: string;

    if (this.forcePathStyle) {
      path = `/${this.bucket}/${sanitized}`;
      targetUrl = new URL(path, baseEndpoint);
    } else if (baseEndpoint.includes('amazonaws.com')) {
      const parsed = new URL(baseEndpoint);
      targetUrl = new URL(`https://${this.bucket}.${parsed.host}/${sanitized}`);
      path = `/${sanitized}`;
    } else {
      path = `/${this.bucket}/${sanitized}`;
      targetUrl = new URL(path, baseEndpoint);
    }

    return {
      url: targetUrl,
      host: targetUrl.host,
      path,
    };
  }

  private hmac(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
  }

  private sha256Hex(data: Buffer | string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = this.hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  /**
   * Generates AWS SigV4 signed headers for standard HTTP requests.
   */
  private signHeaders(params: {
    method: string;
    path: string;
    host: string;
    payloadHash: string;
    contentType?: string;
  }): Record<string, string> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new InternalServerErrorException('S3 credentials (accessKeyId/secretAccessKey) are required for signing.');
    }

    const { method, path, host, payloadHash, contentType } = params;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const headers: Record<string, string> = {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    if (contentType) {
      headers['content-type'] = contentType;
    }

    const signedHeadersList = Object.keys(headers).sort();
    const signedHeaders = signedHeadersList.join(';');
    const canonicalHeaders = signedHeadersList.map((h) => `${h}:${headers[h]}\n`).join('');

    const canonicalRequest = [
      method.toUpperCase(),
      encodeURI(path),
      '', // query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
  }

  /**
   * Persists a binary buffer to S3 storage.
   */
  async put(key: string, buffer: Buffer, options?: StoragePutOptions): Promise<void> {
    const { url, host, path } = this.resolveUrlAndHost(key);
    const payloadHash = this.sha256Hex(buffer);
    const contentType = options?.contentType || 'application/octet-stream';

    const headers = this.signHeaders({
      method: 'PUT',
      path,
      host,
      payloadHash,
      contentType,
    });

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers,
      body: buffer,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new InternalServerErrorException(`S3 PutObject failed [${response.status}]: ${errText || response.statusText}`);
    }
  }

  /**
   * Reads a binary buffer from S3 storage.
   */
  async get(key: string): Promise<Buffer> {
    const { url, host, path } = this.resolveUrlAndHost(key);
    const payloadHash = this.sha256Hex('');

    const headers = this.signHeaders({
      method: 'GET',
      path,
      host,
      payloadHash,
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (response.status === 404) {
      throw new NotFoundException(`File not found in S3 storage: '${key}'.`);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new InternalServerErrorException(`S3 GetObject failed [${response.status}]: ${errText || response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Writes a stream to S3 by buffering into memory.
   */
  async putStream(key: string, stream: NodeJS.ReadableStream | Readable, options?: StoragePutOptions): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    await this.put(key, buffer, options);
  }

  /**
   * Reads an S3 object as a Readable stream.
   */
  async getStream(key: string): Promise<Readable> {
    const buffer = await this.get(key);
    return Readable.from(buffer);
  }

  /**
   * Deletes an object from S3 storage.
   */
  async delete(key: string): Promise<void> {
    const { url, host, path } = this.resolveUrlAndHost(key);
    const payloadHash = this.sha256Hex('');

    const headers = this.signHeaders({
      method: 'DELETE',
      path,
      host,
      payloadHash,
    });

    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers,
    });

    if (!response.ok && response.status !== 404) {
      const errText = await response.text().catch(() => '');
      throw new InternalServerErrorException(`S3 DeleteObject failed [${response.status}]: ${errText || response.statusText}`);
    }
  }

  /**
   * Checks object existence in S3 storage using HEAD request.
   */
  async exists(key: string): Promise<boolean> {
    const { url, host, path } = this.resolveUrlAndHost(key);
    const payloadHash = this.sha256Hex('');

    try {
      const headers = this.signHeaders({
        method: 'HEAD',
        path,
        host,
        payloadHash,
      });

      const response = await fetch(url.toString(), {
        method: 'HEAD',
        headers,
      });

      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Generates an AWS SigV4 presigned URL for downloading the specified key.
   */
  async getSignedUrl(key: string, expiresInSec: number = 3600): Promise<string> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new InternalServerErrorException('S3 credentials are required to generate presigned URLs.');
    }

    const { url, host, path } = this.resolveUrlAndHost(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSec),
      'X-Amz-SignedHeaders': 'host',
    };

    const sortedQuery = Object.keys(queryParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k]!)}`)
      .join('&');

    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = [
      'GET',
      encodeURI(path),
      sortedQuery,
      canonicalHeaders,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return `${url.origin}${path}?${sortedQuery}&X-Amz-Signature=${signature}`;
  }
}
