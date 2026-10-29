import { EnvSchema } from './env.js';

describe('Environment Schema Validation (ARCH-16, DEP-14)', () => {
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

  it('validates a complete, valid environment configuration', () => {
    const result = EnvSchema.safeParse(validBaseEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.API_PORT).toBe(4000);
      expect(result.data.TRUST_PROXY_HOPS).toBe(1);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.ATTENDANCE_CODE_STEP_SECONDS).toBe(30);
    }
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
});

