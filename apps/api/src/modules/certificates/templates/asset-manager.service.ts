import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFImage } from 'pdf-lib';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, normalize } from 'path';

@Injectable()
export class AssetManagerService {
  private readonly assetsDirectory: string;
  private readonly maxAssetSizeBytes = 5 * 1024 * 1024; // 5 MB

  constructor() {
    const cwd = process.cwd();
    const candidateRoot = resolve(cwd, 'apps/api/assets/certificates');
    const candidateApp = resolve(cwd, 'assets/certificates');
    if (existsSync(candidateRoot)) {
      this.assetsDirectory = candidateRoot;
    } else if (existsSync(candidateApp)) {
      this.assetsDirectory = candidateApp;
    } else {
      this.assetsDirectory = candidateRoot;
    }
  }

  /**
   * Resolves and embeds an image asset (PNG or JPEG) into the active PDFDocument.
   */
  async embedAsset(doc: PDFDocument, assetKey: string): Promise<PDFImage> {
    if (!assetKey || assetKey.trim().length === 0) {
      throw new BadRequestException('Asset key cannot be empty.');
    }

    const trimmed = assetKey.trim();

    // 1. Handle Base64 Data URI (e.g., data:image/png;base64,iVBORw0KGgo...)
    if (trimmed.startsWith('data:image/')) {
      return this.embedBase64Asset(doc, trimmed);
    }

    // 2. Resolve named asset from protected certificate assets directory
    return this.embedNamedAsset(doc, trimmed);
  }

  /**
   * Embeds a validated base64 data URI image.
   */
  private async embedBase64Asset(doc: PDFDocument, dataUri: string): Promise<PDFImage> {
    const matches = dataUri.match(/^data:(image\/(png|jpeg|jpg));base64,(.+)$/i);
    if (!matches || !matches[1] || !matches[3]) {
      throw new BadRequestException(
        'Invalid image data URI. Only PNG and JPEG formats are supported (data:image/png;base64,...).',
      );
    }

    const mimeType = matches[1].toLowerCase();
    const base64Data = matches[3];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > this.maxAssetSizeBytes) {
      throw new BadRequestException(`Asset exceeds maximum allowed size of 5 MB.`);
    }

    this.validateImageBuffer(buffer);

    if (mimeType === 'image/png') {
      return await doc.embedPng(buffer);
    }
    return await doc.embedJpg(buffer);
  }

  /**
   * Embeds a predefined institutional asset from disk with path traversal protection.
   */
  private async embedNamedAsset(doc: PDFDocument, key: string): Promise<PDFImage> {
    // Prevent directory traversal: strictly alphanumeric, underscores, hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new BadRequestException(
        `Invalid asset key '${key}'. Asset keys must contain only alphanumeric characters, underscores, and hyphens.`,
      );
    }

    const possibleExtensions = ['.png', '.jpg', '.jpeg'];
    let resolvedPath: string | null = null;

    for (const ext of possibleExtensions) {
      const candidate = normalize(join(this.assetsDirectory, `${key}${ext}`));
      // Strict jail check: ensure candidate path starts with assetsDirectory
      if (candidate.startsWith(this.assetsDirectory) && existsSync(candidate)) {
        resolvedPath = candidate;
        break;
      }
    }

    if (!resolvedPath) {
      throw new NotFoundException(
        `Certificate asset '${key}' was not found in approved asset registry.`,
      );
    }

    const buffer = readFileSync(resolvedPath);
    if (buffer.length > this.maxAssetSizeBytes) {
      throw new BadRequestException(`Asset '${key}' exceeds maximum allowed size of 5 MB.`);
    }

    this.validateImageBuffer(buffer);

    const isPng =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    if (isPng) {
      return await doc.embedPng(buffer);
    }
    return await doc.embedJpg(buffer);
  }

  /**
   * Validates image magic bytes to ensure buffer is genuinely PNG or JPEG.
   */
  private validateImageBuffer(buffer: Buffer): void {
    if (buffer.length < 4) {
      throw new BadRequestException('Image buffer is corrupt or too small.');
    }

    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47; // \x89PNG

    const isJpg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff; // JPEG SOI

    if (!isPng && !isJpg) {
      throw new BadRequestException(
        'Invalid image file format. Only valid PNG and JPEG image buffers are accepted.',
      );
    }
  }
}
