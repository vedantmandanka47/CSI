import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Standard RFC 4648 Base32 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a cryptographically secure random Base32 secret string.
 */
export function generateBase32Secret(byteLength = 20): string {
  const bytes = randomBytes(byteLength);
  let base32 = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      base32 += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    base32 += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return base32;
}

/**
 * Decode a Base32 string to Buffer.
 */
export function decodeBase32(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i] ?? '');
    if (idx === -1) continue; // skip invalid/padding
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Compute RFC 6238 Time-based One-Time Password (TOTP) at a given timestamp.
 */
export function generateTotp(
  secretBase32: string,
  timeStepSeconds = 30,
  timestampMs = Date.now(),
): string {
  const key = decodeBase32(secretBase32);
  const timeSec = Math.floor(timestampMs / 1000);
  const counter = Math.floor(timeSec / timeStepSeconds);

  // 8-byte big-endian counter buffer
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter), 0);

  // HMAC-SHA1 per RFC 6238 standard
  const hmac = createHmac('sha1', key).update(counterBuf).digest();

  // Dynamic truncation (RFC 4226 §5.4)
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binaryCode =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const otp = binaryCode % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify a 6-digit TOTP code against a secret within a time window (tolerance steps).
 * Uses constant-time comparison to eliminate timing attacks.
 */
export function verifyTotp(
  token: string,
  secretBase32: string,
  timeStepSeconds = 30,
  windowSteps = 1,
  timestampMs = Date.now(),
): boolean {
  if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
    return false;
  }

  const tokenBuf = Buffer.from(token);

  // Check window: [current - windowSteps, current + windowSteps]
  for (let stepOffset = -windowSteps; stepOffset <= windowSteps; stepOffset++) {
    const checkTimeMs = timestampMs + stepOffset * timeStepSeconds * 1000;
    const expected = generateTotp(secretBase32, timeStepSeconds, checkTimeMs);
    const expectedBuf = Buffer.from(expected);

    if (tokenBuf.length === expectedBuf.length && timingSafeEqual(tokenBuf, expectedBuf)) {
      return true;
    }
  }

  return false;
}

