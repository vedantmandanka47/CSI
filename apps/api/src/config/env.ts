import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load .env file into process.env before validation
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MIGRATION_DATABASE_URL: z.string().min(1, 'MIGRATION_DATABASE_URL is required'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  CSRF_SECRET: z.string().min(32, 'CSRF_SECRET must be at least 32 characters'),
  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be at least 32 characters'),

  QR_SIGNING_PRIVATE_KEY: z.string().default('dev_qr_private_key'),
  QR_SIGNING_PUBLIC_KEY: z.string().default('dev_qr_public_key'),
  QR_KEY_ID: z.string().default('csi-qr-key-v1'),

  ATTENDANCE_CODE_STEP_SECONDS: z.coerce.number().int().positive().default(30),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().default(1025),
  MAIL_USER: z.string().default('dev'),
  MAIL_PASS: z.string().default('dev'),
  MAIL_FROM: z.string().default('no-reply@csigcet.org'),

  SENTRY_DSN: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON_B64: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadAndValidateEnv(): Env {
  // Allow fallback defaults in test environment if env vars aren't provided
  const rawEnv = {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL || 'postgresql://csi_app:test_password@localhost:5432/csi_gcet_dev',
    MIGRATION_DATABASE_URL:
      process.env.MIGRATION_DATABASE_URL ||
      'postgresql://csi_migrator:test_password@localhost:5432/csi_gcet_dev',
    SESSION_SECRET:
      process.env.SESSION_SECRET || 'dev_session_secret_replace_in_production_32bytes',
    CSRF_SECRET: process.env.CSRF_SECRET || 'dev_csrf_secret_replace_in_production_32bytes_long',
    APP_ENCRYPTION_KEY:
      process.env.APP_ENCRYPTION_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };

  const parseResult = EnvSchema.safeParse(rawEnv);
  if (!parseResult.success) {
    console.error('❌ Invalid or missing environment variables:');
    for (const error of parseResult.error.errors) {
      console.error(`   - ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Application environment validation failed');
  }

  // Production check (DEP-14): local storage driver refuses to start in production
  if (parseResult.data.NODE_ENV === 'production' && parseResult.data.STORAGE_DRIVER === 'local') {
    throw new Error('Local storage driver is forbidden in production (DEP-14). Use S3.');
  }

  return parseResult.data;
}

export const env = loadAndValidateEnv();
