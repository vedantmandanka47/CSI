import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

/**
 * Derives a consistent 32-byte binary key from any configured APP_ENCRYPTION_KEY.
 */
function deriveKey(secret: string): Buffer {
  if (secret.length === 64 && /^[0-9a-fA-F]+$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a plaintext string using authenticated AES-256-GCM.
 * Output format: enc:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>
 */
export function encryptAes256Gcm(plaintext: string, secretKey: string): string {
  const key = deriveKey(secretKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString('base64url')}:${authTag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

/**
 * Decrypts an authenticated AES-256-GCM string.
 * Gracefully returns original string if it is not an encrypted token (for backward compatibility).
 */
export function decryptAes256Gcm(encryptedString: string, secretKey: string): string {
  if (!encryptedString || !encryptedString.startsWith('enc:')) {
    return encryptedString;
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 4) {
    return encryptedString;
  }

  const iv = Buffer.from(parts[1]!, 'base64url');
  const authTag = Buffer.from(parts[2]!, 'base64url');
  const ciphertext = Buffer.from(parts[3]!, 'base64url');
  const key = deriveKey(secretKey);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

