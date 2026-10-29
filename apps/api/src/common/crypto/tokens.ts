import crypto from 'crypto';
import argon2 from 'argon2';

/**
 * DEP-03 & PRIV-13: Memory-hard Argon2id parameters
 * memoryCost: 64 MB (65536 KiB), timeCost: 3 iterations, parallelism: 1 thread
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure 64-character hex string (256 bits of entropy)
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes a SHA-256 hash of a plain token string for database persistence
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

