import { EnvSchema } from '../../../../apps/api/src/config/env.js';
import { normalizeEd25519Key } from '../../../../apps/api/src/common/crypto/keys.util.js';
import { generateKeyPairSync } from 'crypto';

describe('Environment Schema Validation (ARCH-16, DEP-14, AUD-SEC-01)', () => {
  const testEd25519Pair = generateKeyPairSync('ed25519');
  const validEd25519Priv = testEd25519Pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const validEd25519Pub = testEd25519Pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const validBaseEnv = {
    NODE_ENV: 'development',
    API_PORT: '4000',
    PUBLIC_APP_URL: 'http://localhost:3000',
    TRUST_PROXY_HOPS: '1',
    DATABASE_URL: 'postgresql://csi_app:secret@localhost:5432/csi_gcet_dev',
    MIGRATION_DATABASE_URL: 'postgresql://csi_migrator:secret@localhost:5432/csi_gcet_dev',
    SESSION_SECRET: 'a_very_secure_random_session_secret_32bytes_long',
    CSRF_SECRET: 'a_very_secure_random_csrf_secret_32bytes_long',
    APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    STORAGE_DRIVER: 'local',
  };

  const validProdEnv = {
    ...validBaseEnv,
    NODE_ENV: 'production',
    SESSION_SECRET: 'prod_unique_random_session_secret_at_least_32_bytes_entropy',
    CSRF_SECRET: 'prod_unique_random_csrf_secret_at_least_32_bytes_entropy_value',
    APP_ENCRYPTION_KEY: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    QR_SIGNING_PRIVATE_KEY: validEd25519Priv,
    QR_SIGNING_PUBLIC_KEY: validEd25519Pub,
    STORAGE_ROOT_DIR: '/var/data/csi/storage',
  };

  it('validates a complete, valid development environment configuration', () => {
    const result = EnvSchema.safeParse(validBaseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.API_PORT).toBe(4000);
      expect(result.data.TRUST_PROXY_HOPS).toBe(1);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.ATTENDANCE_CODE_STEP_SECONDS).toBe(30);
    }
  });

  it('validates a complete, hardened production environment configuration', () => {
    const result = EnvSchema.safeParse(validProdEnv);
    expect(result.success).toBe(true);
  });

  it('validates base64-encoded Ed25519 keys emitted by gen-secrets.mjs in production (TASK-009 / B10)', () => {
    const b64Priv = Buffer.from(validEd25519Priv).toString('base64');
    const b64Pub = Buffer.from(validEd25519Pub).toString('base64');
    const result = EnvSchema.safeParse({
      ...validProdEnv,
      QR_SIGNING_PRIVATE_KEY: b64Priv,
      QR_SIGNING_PUBLIC_KEY: b64Pub,
    });
    expect(result.success).toBe(true);
  });

  it('validates Ed25519 keys with literal escaped newlines and outer quotes', () => {
    const escapedPriv = `"${validEd25519Priv.replace(/\n/g, '\\n')}"`;
    const escapedPub = `'${validEd25519Pub.replace(/\n/g, '\\n')}'`;
    const result = EnvSchema.safeParse({
      ...validProdEnv,
      QR_SIGNING_PRIVATE_KEY: escapedPriv,
      QR_SIGNING_PUBLIC_KEY: escapedPub,
    });
    expect(result.success).toBe(true);
  });

  it('normalizes various key representations via normalizeEd25519Key', () => {
    expect(normalizeEd25519Key(undefined)).toBeNull();
    expect(normalizeEd25519Key('')).toBeNull();
    const b64 = Buffer.from(validEd25519Priv).toString('base64');
    expect(normalizeEd25519Key(b64)).toBe(validEd25519Priv.trim());
    expect(normalizeEd25519Key(`"${validEd25519Priv.trim()}"`)).toBe(validEd25519Priv.trim());
  });

  it('rejects short session or CSRF secrets (< 32 characters)', () => {
    const invalidEnv = {
      ...validBaseEnv,
      SESSION_SECRET: 'too_short',
    };

    const result = EnvSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('SESSION_SECRET');
    }
  });

  it('rejects invalid PUBLIC_APP_URL', () => {
    const invalidEnv = {
      ...validBaseEnv,
      PUBLIC_APP_URL: 'not-a-valid-url',
    };

    const result = EnvSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('PUBLIC_APP_URL');
    }
  });

  it('rejects invalid NODE_ENV values', () => {
    const invalidEnv = {
      ...validBaseEnv,
      NODE_ENV: 'staging',
    };

    const result = EnvSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });

  describe('Production Hardening & Secret Rejection (AUD-SEC-01)', () => {
    it('rejects development placeholder SESSION_SECRET in production', () => {
      const result = EnvSchema.safeParse({
        ...validProdEnv,
        SESSION_SECRET: 'dev_session_secret_replace_in_production_32bytes',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('SESSION_SECRET'))).toBe(true);
      }
    });

    it('rejects development placeholder CSRF_SECRET in production', () => {
      const result = EnvSchema.safeParse({
        ...validProdEnv,
        CSRF_SECRET: 'dev_csrf_secret_replace_in_production_32bytes_long',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('CSRF_SECRET'))).toBe(true);
      }
    });

    it('rejects default APP_ENCRYPTION_KEY or invalid hex length in production', () => {
      const resultDefault = EnvSchema.safeParse({
        ...validProdEnv,
        APP_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });
      expect(resultDefault.success).toBe(false);

      const resultInvalidHex = EnvSchema.safeParse({
        ...validProdEnv,
        APP_ENCRYPTION_KEY: 'not_a_valid_hex_key_must_be_64_characters_long_for_aes_256_gcm_pad',
      });
      expect(resultInvalidHex.success).toBe(false);
    });

    it('rejects development placeholder QR signing keys in production', () => {
      const result = EnvSchema.safeParse({
        ...validProdEnv,
        QR_SIGNING_PRIVATE_KEY: 'dev_qr_private_key',
        QR_SIGNING_PUBLIC_KEY: 'dev_qr_public_key',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('QR_SIGNING_PRIVATE_KEY');
        expect(paths).toContain('QR_SIGNING_PUBLIC_KEY');
      }
    });

    it('rejects local storage driver in production if STORAGE_ROOT_DIR is missing', () => {
      const missingRootDir = {
        ...validProdEnv,
        STORAGE_ROOT_DIR: undefined,
      };
      const result = EnvSchema.safeParse(missingRootDir);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('STORAGE_ROOT_DIR'))).toBe(true);
      }
    });

    it('rejects unsupported S3 storage driver in production', () => {
      const s3Prod = {
        ...validProdEnv,
        STORAGE_DRIVER: 's3',
      };
      const result = EnvSchema.safeParse(s3Prod);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('STORAGE_DRIVER'))).toBe(true);
      }
    });

    it('rejects invalid, non-ed25519, or mismatched Ed25519 key-pair in production', () => {
      const pair1 = generateKeyPairSync('ed25519');
      const pair2 = generateKeyPairSync('ed25519');

      // Mismatched keys
      const mismatched = EnvSchema.safeParse({
        ...validProdEnv,
        QR_SIGNING_PRIVATE_KEY: pair1.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        QR_SIGNING_PUBLIC_KEY: pair2.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      });
      expect(mismatched.success).toBe(false);
      if (!mismatched.success) {
        expect(
          mismatched.error.issues.some((i) =>
            i.message.includes('QR_SIGNING_PUBLIC_KEY does not correspond to QR_SIGNING_PRIVATE_KEY'),
          ),
        ).toBe(true);
      }

      // Non-ed25519 key (e.g. RSA)
      const rsaPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const rsaConfig = EnvSchema.safeParse({
        ...validProdEnv,
        QR_SIGNING_PRIVATE_KEY: rsaPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        QR_SIGNING_PUBLIC_KEY: rsaPair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      });
      expect(rsaConfig.success).toBe(false);
      if (!rsaConfig.success) {
        expect(
          rsaConfig.error.issues.some((i) => i.message.includes('must be an ed25519 key')),
        ).toBe(true);
      }
    });
  });
});
