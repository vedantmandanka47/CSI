import { encryptAes256Gcm, decryptAes256Gcm } from '../../../../../apps/api/src/common/crypto/encryption.js';

describe('AES-256-GCM Encryption (AUD-SEC-04)', () => {
  const secretKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const secretKeyString = 'super-secret-key-at-least-32-chars-long!';

  it('encrypts and decrypts plaintext correctly with hex key', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptAes256Gcm(secret, secretKeyHex);

    expect(encrypted).toMatch(/^enc:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.length).toBeLessThan(128); // Must fit in VARCHAR(128)

    const decrypted = decryptAes256Gcm(encrypted, secretKeyHex);
    expect(decrypted).toBe(secret);
  });

  it('encrypts and decrypts plaintext correctly with non-hex key string', () => {
    const secret = 'TOTP_SECRET_KEY_1234567890';
    const encrypted = encryptAes256Gcm(secret, secretKeyString);

    expect(encrypted).toMatch(/^enc:/);
    const decrypted = decryptAes256Gcm(encrypted, secretKeyString);
    expect(decrypted).toBe(secret);
  });

  it('gracefully handles legacy plaintext without enc: prefix', () => {
    const legacyPlaintext = 'JBSWY3DPEHPK3PXP';
    const result = decryptAes256Gcm(legacyPlaintext, secretKeyHex);
    expect(result).toBe(legacyPlaintext);
  });

  it('fails decryption when ciphertext or auth tag is tampered with', () => {
    const secret = 'SECRET_VALUE';
    const encrypted = encryptAes256Gcm(secret, secretKeyHex);
    const parts = encrypted.split(':');
    // Tamper with the ciphertext
    const tamperedCiphertext = Buffer.from('corrupted_data').toString('base64url');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

    expect(() => decryptAes256Gcm(tampered, secretKeyHex)).toThrow();
  });
});

