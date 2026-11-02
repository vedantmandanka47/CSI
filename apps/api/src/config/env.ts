import { z } from 'zod';
import * as dotenv from 'dotenv';
import { createPrivateKey, createPublicKey } from 'crypto';

// Load .env file into process.env before validation
dotenv.config();

const KNOWN_DEV_SECRETS = [
  'dev_session_secret_replace_in_production_32bytes',
  'dev_csrf_secret_replace_in_production_32bytes_long',
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'dev_qr_private_key',
  'dev_qr_public_key',
];

export const EnvSchema = z
  .object({
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
    STORAGE_ROOT_DIR: z.string().optional(),
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
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // SEC-01: Disallow development fallback secrets in production
      if (KNOWN_DEV_SECRETS.includes(data.SESSION_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must not use development default in production environment',
        });
      }

      if (KNOWN_DEV_SECRETS.includes(data.CSRF_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CSRF_SECRET'],
          message: 'CSRF_SECRET must not use development default in production environment',
        });
      }

      if (KNOWN_DEV_SECRETS.includes(data.APP_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_ENCRYPTION_KEY'],
          message: 'APP_ENCRYPTION_KEY must not use development default in production environment',
        });
      }

      // APP_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes AES-256)
      if (!/^[0-9a-fA-F]{64}$/.test(data.APP_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_ENCRYPTION_KEY'],
          message:
            'APP_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes for AES-256-GCM)',
        });
      }

      if (data.QR_SIGNING_PRIVATE_KEY === 'dev_qr_private_key') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QR_SIGNING_PRIVATE_KEY'],
          message: 'QR_SIGNING_PRIVATE_KEY must be configured in production environment',
        });
      }

      if (data.QR_SIGNING_PUBLIC_KEY === 'dev_qr_public_key') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['QR_SIGNING_PUBLIC_KEY'],
          message: 'QR_SIGNING_PUBLIC_KEY must be configured in production environment',
        });
      }

      // Cryptographic validation of Ed25519 key-pair and key correspondence (Part 3.1)
      if (
        data.QR_SIGNING_PRIVATE_KEY &&
        data.QR_SIGNING_PRIVATE_KEY !== 'dev_qr_private_key' &&
        data.QR_SIGNING_PUBLIC_KEY &&
        data.QR_SIGNING_PUBLIC_KEY !== 'dev_qr_public_key'
      ) {
        try {
          const privKey = createPrivateKey(data.QR_SIGNING_PRIVATE_KEY);
          if (privKey.asymmetricKeyType !== 'ed25519') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['QR_SIGNING_PRIVATE_KEY'],
              message: `QR_SIGNING_PRIVATE_KEY must be an ed25519 key, received '${privKey.asymmetricKeyType}'`,
            });
          } else {
            const derivedPub = createPublicKey(privKey);
            const derivedPubDer = derivedPub.export({ type: 'spki', format: 'der' });

            try {
              const pubKey = createPublicKey(data.QR_SIGNING_PUBLIC_KEY);
              if (pubKey.asymmetricKeyType !== 'ed25519') {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: ['QR_SIGNING_PUBLIC_KEY'],
                  message: `QR_SIGNING_PUBLIC_KEY must be an ed25519 key, received '${pubKey.asymmetricKeyType}'`,
                });
              } else {
                const pubDer = pubKey.export({ type: 'spki', format: 'der' });
                if (!derivedPubDer.equals(pubDer)) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['QR_SIGNING_PUBLIC_KEY'],
                    message:
                      'QR_SIGNING_PUBLIC_KEY does not correspond to QR_SIGNING_PRIVATE_KEY',
                  });
                }
              }
            } catch (pubErr) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['QR_SIGNING_PUBLIC_KEY'],
                message: `Invalid QR_SIGNING_PUBLIC_KEY: ${(pubErr as Error).message}`,
              });
            }
          }
        } catch (privErr) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['QR_SIGNING_PRIVATE_KEY'],
            message: `Invalid QR_SIGNING_PRIVATE_KEY: ${(privErr as Error).message}`,
          });
        }
      }

      // Storage driver validation in production (DEP-14, Part 5)
      if (data.STORAGE_DRIVER === 'local' && !data.STORAGE_ROOT_DIR) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_ROOT_DIR'],
          message:
            'STORAGE_ROOT_DIR must be explicitly specified when using local storage in production (DEP-14)',
        });
      }

      if (data.STORAGE_DRIVER === 's3') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['STORAGE_DRIVER'],
          message:
            'S3 storage driver is not implemented. Deployments must use persistent local storage with STORAGE_DRIVER=local and STORAGE_ROOT_DIR set to a persistent volume mount.',
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

function loadAndValidateEnv(): Env {
  const isTest = process.env.NODE_ENV === 'test';

  // AUD-SEC-01: Only inject test fallback defaults when explicitly running under test
  // In development and production, do not inject fallbacks into missing variables
  const rawEnv = isTest
    ? {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ||
          'postgresql://csi_app:test_password@localhost:5432/csi_gcet_dev',
        MIGRATION_DATABASE_URL:
          process.env.MIGRATION_DATABASE_URL ||
          'postgresql://csi_migrator:test_password@localhost:5432/csi_gcet_dev',
        SESSION_SECRET:
          process.env.SESSION_SECRET || 'dev_session_secret_replace_in_production_32bytes',
        CSRF_SECRET:
          process.env.CSRF_SECRET || 'dev_csrf_secret_replace_in_production_32bytes_long',
        APP_ENCRYPTION_KEY:
          process.env.APP_ENCRYPTION_KEY ||
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }
    : process.env;

  const parseResult = EnvSchema.safeParse(rawEnv);
  if (!parseResult.success) {
    console.error('❌ Invalid or missing environment variables:');
    for (const error of parseResult.error.errors) {
      console.error(`   - ${error.path.join('.')}: ${error.message}`);
    }
    throw new Error('Application environment validation failed');
  }

  return parseResult.data;
}

export const env = loadAndValidateEnv();
