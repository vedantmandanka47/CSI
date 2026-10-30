import { existsSync, readFileSync } from 'node:fs';
import * as dotenv from 'dotenv';

const ALLOWED_TEST_HOSTS = ['localhost', '127.0.0.1', '::1'];
const REQUIRED_TEST_DATABASE = 'csi_gcet_test';
const REQUIRED_TEST_PORT = '5432';

export interface E2eDatabaseResolutionOptions {
  env?: NodeJS.ProcessEnv;
  envFilePath?: string;
}

/**
 * Validates that a database URL strictly targets the approved local test database.
 * Never includes credentials, tokens, or query parameters in error messages.
 */
export function validateE2eDatabaseUrl(urlString: string): {
  hostname: string;
  port: string;
  database: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(
      '[SAFETY FATAL] Invalid E2E database configuration: URL is malformed or unparseable.',
    );
  }

  const protocol = parsed.protocol;
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error(
      `[SAFETY FATAL] Database protocol violation: protocol "${protocol}" is not supported (expected postgresql:).`,
    );
  }

  const hostname = parsed.hostname;
  if (!hostname || !ALLOWED_TEST_HOSTS.includes(hostname.toLowerCase())) {
    throw new Error(
      `[SAFETY FATAL] E2E database host violation: host "${hostname || 'unresolved'}" is not a permitted local test host (must be localhost or 127.0.0.1).`,
    );
  }

  const port = parsed.port;
  if (port && port !== REQUIRED_TEST_PORT) {
    throw new Error(
      `[SAFETY FATAL] E2E database port violation: port "${port}" is not permitted (must be ${REQUIRED_TEST_PORT}).`,
    );
  }

  // Pathname must be strictly '/csi_gcet_test' (normalized and decoded)
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(parsed.pathname);
  } catch {
    throw new Error(
      '[SAFETY FATAL] Database pathname violation: pathname contains invalid percent-encoding.',
    );
  }

  if (!decodedPathname || decodedPathname === '/') {
    throw new Error(
      '[SAFETY FATAL] Database pathname violation: missing database name in connection URL.',
    );
  }

  if (decodedPathname !== `/${REQUIRED_TEST_DATABASE}`) {
    const rawDbName = decodedPathname.replace(/^\//, '');
    throw new Error(
      `[SAFETY FATAL] Database target violation: database is "${rawDbName}". E2E test execution is strictly restricted to "${REQUIRED_TEST_DATABASE}".`,
    );
  }

  return {
    hostname,
    port: port || REQUIRED_TEST_PORT,
    database: REQUIRED_TEST_DATABASE,
  };
}

/**
 * Resolves the effective DATABASE_URL for E2E tests (U1 / Batch 15 / Batch 16 / Batch 17).
 * Ensures fail-closed behavior if the effective target is not strictly "csi_gcet_test".
 */
export function resolveE2eDatabaseUrl(options: E2eDatabaseResolutionOptions = {}): string {
  const env = options.env ?? process.env;

  // Case 1: DATABASE_URL is explicitly set in environment
  if (env.DATABASE_URL) {
    validateE2eDatabaseUrl(env.DATABASE_URL);
    return env.DATABASE_URL;
  }

  // Case 2: Derive from local environment file
  const envFilePath = options.envFilePath;
  if (!envFilePath || !existsSync(envFilePath)) {
    throw new Error(
      `[SAFETY FATAL] Missing E2E database configuration: neither DATABASE_URL is set in environment nor environment file exists at "${envFilePath ?? 'unspecified'}".`,
    );
  }

  let fileContent: string;
  try {
    fileContent = readFileSync(envFilePath, 'utf-8');
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[SAFETY FATAL] Failed to read environment file at "${envFilePath}": ${errorMsg}.`,
    );
  }

  const parsedEnv = dotenv.parse(fileContent);
  const baseDbUrl = parsedEnv.DATABASE_URL;
  if (!baseDbUrl) {
    throw new Error(
      `[SAFETY FATAL] Missing E2E database configuration: environment file at "${envFilePath}" does not define DATABASE_URL.`,
    );
  }

  let baseParsed: URL;
  try {
    baseParsed = new URL(baseDbUrl);
  } catch {
    throw new Error(
      '[SAFETY FATAL] Invalid E2E database configuration: DATABASE_URL in environment file is malformed or unparseable.',
    );
  }

  const baseHostname = baseParsed.hostname;
  if (!baseHostname || !ALLOWED_TEST_HOSTS.includes(baseHostname.toLowerCase())) {
    throw new Error(
      `[SAFETY FATAL] E2E database host violation: environment file defines host "${baseHostname || 'unresolved'}" which is not a permitted local test host.`,
    );
  }

  const basePort = baseParsed.port;
  if (basePort && basePort !== REQUIRED_TEST_PORT) {
    throw new Error(
      `[SAFETY FATAL] E2E database port violation: environment file defines port "${basePort}" which is not permitted (must be ${REQUIRED_TEST_PORT}).`,
    );
  }

  // Safely substitute pathname with strictly the test database (stripping search/hash)
  baseParsed.pathname = `/${REQUIRED_TEST_DATABASE}`;
  baseParsed.search = '';
  baseParsed.hash = '';
  const derivedUrl = baseParsed.toString();

  // Validate the final derived URL
  validateE2eDatabaseUrl(derivedUrl);

  return derivedUrl;
}

/**
 * Strict fail-closed verification utility for database tests (U1 / Finding F-01).
 * Ensures that tests performing destructive operations (table truncation, row deletion)
 * can ONLY run against the verified local test database "csi_gcet_test".
 */
export async function assertStrictTestDatabase(prisma: {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
}): Promise<string> {
  let result: { current_database: string }[];
  try {
    result = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database();`;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[SAFETY FATAL] Failed to verify live database target: ${errorMsg}. Aborting before any mutations.`,
    );
  }

  const liveDbName = result?.[0]?.current_database;

  if (liveDbName !== REQUIRED_TEST_DATABASE) {
    throw new Error(
      `[SAFETY FATAL] Database target violation: live database is "${liveDbName ?? 'unresolved'}". ` +
        `Destructive test operations are strictly forbidden from running against any database other than "${REQUIRED_TEST_DATABASE}". ` +
        `Aborting immediately without mutating data.`,
    );
  }

  return liveDbName;
}



