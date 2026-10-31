/**
 * E2E Test Setup (U1 / Finding F-01, Batch 15, Batch 16)
 * Enforces test environment settings before NestJS bootstrap.
 * Directs E2E tests strictly to the isolated "csi_gcet_test" database.
 */
import { resolve } from 'node:path';
import { resolveE2eDatabaseUrl } from '../../apps/api/src/common/guards/test-db-guard.js';

process.env.NODE_ENV = 'test';

// Resolve and validate the effective DATABASE_URL.
// Fails closed if the effective target is not strictly "csi_gcet_test" on a local host.
const resolvedUrl = resolveE2eDatabaseUrl({
  env: process.env,
  envFilePath: resolve(__dirname, '../../apps/api/.env'),
});

process.env.DATABASE_URL = resolvedUrl;
