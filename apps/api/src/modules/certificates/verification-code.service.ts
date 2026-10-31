import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';

/**
 * Crockford Base32 Character Set (32 characters, 5 bits per character).
 * Excludes ambiguous and profanity-prone characters: I, L, O, U.
 */
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

@Injectable()
export class VerificationCodeService {
  /**
   * Generates a cryptographically secure 80-bit entropy verification code
   * encoded in Crockford Base32 (16 characters).
   */
  generateVerificationCode(): string {
    const buffer = randomBytes(10); // 80 bits = 10 bytes
    return this.encodeCrockford(buffer);
  }

  /**
   * Encodes a Buffer to Crockford Base32.
   * 10 bytes (80 bits) produces exactly 16 Base32 characters (16 * 5 = 80 bits).
   */
  encodeCrockford(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i] ?? 0;
      value = (value << 8) | byte;
      bits += 8;

      while (bits >= 5) {
        output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  /**
   * Normalizes an incoming verification code:
   * 1. Trims and converts to uppercase.
   * 2. Strips spaces, hyphens, and dots.
   * 3. Maps Crockford phonetic/visual aliases: I, L -> 1; O -> 0.
   */
  normalizeVerificationCode(rawCode: string): string {
    if (!rawCode || typeof rawCode !== 'string') {
      return '';
    }

    return rawCode
      .trim()
      .toUpperCase()
      .replace(/[\s\-_.]/g, '')
      .replace(/[IL]/g, '1')
      .replace(/O/g, '0');
  }

  /**
   * Validates whether a code (raw or normalized) adheres to the 16-character Crockford Base32 specification.
   */
  isValidCode(rawCode: string): boolean {
    const normalized = this.normalizeVerificationCode(rawCode);
    if (normalized.length !== 16) {
      return false;
    }

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i] ?? '';
      if (!CROCKFORD_ALPHABET.includes(char)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Computes the SHA-256 hex hash of the normalized verification code.
   * Only the hash is stored in PostgreSQL for privacy and anti-forgery protection.
   */
  hashVerificationCode(rawCode: string): string {
    const normalized = this.normalizeVerificationCode(rawCode);
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Formats a 16-character canonical code into human-friendly 4x4 blocks (XXXX-XXXX-XXXX-XXXX).
   */
  formatVerificationCode(code: string): string {
    const normalized = this.normalizeVerificationCode(code);
    if (normalized.length !== 16) {
      return normalized;
    }
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`;
  }

  /**
   * Constructs the canonical public verification URL for QR codes and certificate links.
   */
  buildVerificationUrl(code: string): string {
    const formatted = this.formatVerificationCode(code);
    const baseUrl =
      process.env.APP_URL ||
      process.env.FRONTEND_URL ||
      'https://csi.gcet.ac.in';
    return `${baseUrl.replace(/\/$/, '')}/verify/${formatted}`;
  }
}
