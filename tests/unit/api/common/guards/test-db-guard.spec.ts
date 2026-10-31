import {
  assertStrictTestDatabase,
  validateE2eDatabaseUrl,
  resolveE2eDatabaseUrl,
} from '../../../../../apps/api/src/common/guards/test-db-guard.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('assertStrictTestDatabase (U1 / Finding F-01)', () => {
  it('passes when the live database target is strictly "csi_gcet_test"', async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'csi_gcet_test' }]),
    };

    const target = await assertStrictTestDatabase(mockPrisma);
    expect(target).toBe('csi_gcet_test');
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails closed and throws SAFETY FATAL when target is "csi_gcet_dev"', async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'csi_gcet_dev' }]),
    };

    await expect(assertStrictTestDatabase(mockPrisma)).rejects.toThrow(
      /\[SAFETY FATAL\] Database target violation: live database is "csi_gcet_dev"/,
    );
  });

  it('fails closed and throws SAFETY FATAL when target is an arbitrary or production database', async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'production_main_db' }]),
    };

    await expect(assertStrictTestDatabase(mockPrisma)).rejects.toThrow(
      /\[SAFETY FATAL\] Database target violation: live database is "production_main_db"/,
    );
  });

  it('fails closed when database query returns empty results', async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    await expect(assertStrictTestDatabase(mockPrisma)).rejects.toThrow(
      /\[SAFETY FATAL\] Database target violation: live database is "unresolved"/,
    );
  });

  it('fails closed when query execution throws an error', async () => {
    const mockPrisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('Connection lost to socket')),
    };

    await expect(assertStrictTestDatabase(mockPrisma)).rejects.toThrow(
      /\[SAFETY FATAL\] Failed to verify live database target: Connection lost to socket/,
    );
  });
});

describe('validateE2eDatabaseUrl & resolveE2eDatabaseUrl (Batch 16)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csi-test-env-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('1. accepts a valid local URL targeting "csi_gcet_test"', () => {
    const url = 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_test';
    const res = validateE2eDatabaseUrl(url);
    expect(res.hostname).toBe('localhost');
    expect(res.database).toBe('csi_gcet_test');

    const resolved = resolveE2eDatabaseUrl({
      env: { DATABASE_URL: url },
    });
    expect(resolved).toBe(url);
  });

  it('2. accepts 127.0.0.1 as a valid local test host for "csi_gcet_test"', () => {
    const url = 'postgresql://csi_app:secret123@127.0.0.1:5432/csi_gcet_test';
    const res = validateE2eDatabaseUrl(url);
    expect(res.hostname).toBe('127.0.0.1');
    expect(res.database).toBe('csi_gcet_test');
  });

  it('3. rejects a URL targeting "csi_gcet_dev"', () => {
    const url = 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_dev';
    expect(() => validateE2eDatabaseUrl(url)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi_gcet_dev"/,
    );
    expect(() =>
      resolveE2eDatabaseUrl({
        env: { DATABASE_URL: url },
      }),
    ).toThrow(/\[SAFETY FATAL\] Database target violation: database is "csi_gcet_dev"/);
  });

  it('4. rejects an unexpected database name', () => {
    const url = 'postgresql://csi_app:secret123@localhost:5432/custom_staging';
    expect(() => validateE2eDatabaseUrl(url)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "custom_staging"/,
    );
  });

  it('5. rejects a remote host targeting "csi_gcet_test"', () => {
    const url = 'postgresql://csi_app:secret123@rds.amazonaws.com:5432/csi_gcet_test';
    expect(() => validateE2eDatabaseUrl(url)).toThrow(
      /\[SAFETY FATAL\] E2E database host violation: host "rds\.amazonaws\.com" is not a permitted local test host/,
    );
    expect(() =>
      resolveE2eDatabaseUrl({
        env: { DATABASE_URL: url },
      }),
    ).toThrow(
      /\[SAFETY FATAL\] E2E database host violation: host "rds\.amazonaws\.com" is not a permitted local test host/,
    );
  });

  it('6. rejects missing URL when environment file does not exist', () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist.env');
    expect(() =>
      resolveE2eDatabaseUrl({
        env: {},
        envFilePath: nonExistentPath,
      }),
    ).toThrow(/\[SAFETY FATAL\] Missing E2E database configuration/);
  });

  it('7. rejects a malformed URL without exposing tokens', () => {
    expect(() =>
      resolveE2eDatabaseUrl({
        env: { DATABASE_URL: 'invalid-malformed-connection-string' },
      }),
    ).toThrow(
      /\[SAFETY FATAL\] Invalid E2E database configuration: URL is malformed or unparseable/,
    );
  });

  it('8. rejects an explicitly inherited unsafe DATABASE_URL (inherited from parent process)', () => {
    const unsafeEnv = {
      DATABASE_URL: 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_dev',
    };
    expect(() => resolveE2eDatabaseUrl({ env: unsafeEnv })).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi_gcet_dev"/,
    );
  });

  it('9. derives csi_gcet_test safely from a valid local environment file', () => {
    const envFile = path.join(tempDir, '.env');
    fs.writeFileSync(
      envFile,
      'DATABASE_URL=postgresql://csi_app:secret123@localhost:5432/csi_gcet_dev\n',
    );

    const derived = resolveE2eDatabaseUrl({
      env: {},
      envFilePath: envFile,
    });

    const parsed = new URL(derived);
    expect(parsed.hostname).toBe('localhost');
    expect(parsed.pathname).toBe('/csi_gcet_test');
    expect(parsed.username).toBe('csi_app');
  });

  it('10. rejects an environment file that defines a remote host', () => {
    const envFile = path.join(tempDir, '.env');
    fs.writeFileSync(
      envFile,
      'DATABASE_URL=postgresql://csi_app:secret123@remote.db.server.internal:5432/csi_gcet_dev\n',
    );

    expect(() =>
      resolveE2eDatabaseUrl({
        env: {},
        envFilePath: envFile,
      }),
    ).toThrow(
      /\[SAFETY FATAL\] E2E database host violation: environment file defines host "remote\.db\.server\.internal"/,
    );
  });

  it('11. rejects an environment file that does not define DATABASE_URL', () => {
    const envFile = path.join(tempDir, '.env');
    fs.writeFileSync(envFile, 'API_PORT=4000\nNODE_ENV=development\n');

    expect(() =>
      resolveE2eDatabaseUrl({
        env: {},
        envFilePath: envFile,
      }),
    ).toThrow(/Missing E2E database configuration: environment file at .* does not define DATABASE_URL/);
  });

  it('12. rejects a malformed DATABASE_URL in an environment file', () => {
    const envFile = path.join(tempDir, '.env');
    fs.writeFileSync(envFile, 'DATABASE_URL=not-a-valid-connection-string\n');

    expect(() =>
      resolveE2eDatabaseUrl({
        env: {},
        envFilePath: envFile,
      }),
    ).toThrow(
      /\[SAFETY FATAL\] Invalid E2E database configuration: DATABASE_URL in environment file is malformed or unparseable/,
    );
  });

  it('13. rejects missing database name (empty or trailing slash)', () => {
    const urlWithoutSlash = 'postgresql://csi_app:secret123@localhost:5432';
    expect(() => validateE2eDatabaseUrl(urlWithoutSlash)).toThrow(
      /\[SAFETY FATAL\] Database pathname violation: missing database name in connection URL/,
    );

    const urlWithOnlySlash = 'postgresql://csi_app:secret123@localhost:5432/';
    expect(() => validateE2eDatabaseUrl(urlWithOnlySlash)).toThrow(
      /\[SAFETY FATAL\] Database pathname violation: missing database name in connection URL/,
    );
  });

  it('14. rejects unsupported URL protocols (e.g. mysql, http, mongodb)', () => {
    const mysqlUrl = 'mysql://csi_app:secret123@localhost:5432/csi_gcet_test';
    expect(() => validateE2eDatabaseUrl(mysqlUrl)).toThrow(
      /\[SAFETY FATAL\] Database protocol violation: protocol "mysql:" is not supported/,
    );

    const httpUrl = 'http://csi_app:secret123@localhost:5432/csi_gcet_test';
    expect(() => validateE2eDatabaseUrl(httpUrl)).toThrow(
      /\[SAFETY FATAL\] Database protocol violation: protocol "http:" is not supported/,
    );
  });

  it('15. rejects unexpected ports (mandatory port 5432)', () => {
    const wrongPortUrl = 'postgresql://csi_app:secret123@localhost:5433/csi_gcet_test';
    expect(() => validateE2eDatabaseUrl(wrongPortUrl)).toThrow(
      /\[SAFETY FATAL\] E2E database port violation: port "5433" is not permitted \(must be 5432\)/,
    );

    const envFile = path.join(tempDir, '.env');
    fs.writeFileSync(
      envFile,
      'DATABASE_URL=postgresql://csi_app:secret123@localhost:6543/csi_gcet_dev\n',
    );
    expect(() =>
      resolveE2eDatabaseUrl({
        env: {},
        envFilePath: envFile,
      }),
    ).toThrow(
      /\[SAFETY FATAL\] E2E database port violation: environment file defines port "6543" which is not permitted \(must be 5432\)/,
    );
  });

  it('16. strictly rejects ambiguous or nested database pathnames', () => {
    const nestedPathUrl = 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_test/extra';
    expect(() => validateE2eDatabaseUrl(nestedPathUrl)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi_gcet_test\/extra"/,
    );

    const trailingSlashUrl = 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_test/';
    expect(() => validateE2eDatabaseUrl(trailingSlashUrl)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi_gcet_test\/"/,
    );
  });

  it('17. guarantees that error messages never expose credentials, usernames, passwords, or query tokens', () => {
    const sensitiveUser = 'super_sensitive_admin';
    const sensitivePass = 'MegaP@ssw0rd999#';
    const sensitiveToken = 'SecretTokenValue123456';
    const dangerousUrl = `postgresql://${sensitiveUser}:${sensitivePass}@remote.cloud.database.com:9999/malicious_db?access_token=${sensitiveToken}`;

    let capturedError: Error | null = null;
    try {
      validateE2eDatabaseUrl(dangerousUrl);
    } catch (err: unknown) {
      capturedError = err as Error;
    }

    expect(capturedError).not.toBeNull();
    const msg = capturedError!.message;

    // Verify error was safety fatal
    expect(msg).toContain('[SAFETY FATAL]');

    // Verify zero credential leakage
    expect(msg).not.toContain(sensitiveUser);
    expect(msg).not.toContain(sensitivePass);
    expect(msg).not.toContain(sensitiveToken);
    expect(msg).not.toContain('access_token');
    expect(msg).not.toContain(dangerousUrl);
  });

  it('18. confirms setup resolves configuration before application initialization (isolated lifecycle simulation)', () => {
    const envFile = path.join(tempDir, '.env');
    fs.writeFileSync(
      envFile,
      'DATABASE_URL=postgresql://csi_app:secret123@localhost:5432/csi_gcet_dev\n',
    );

    const simulatedProcessEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
    };

    // Step 1: E2E setup executes before any application code
    const resolvedUrl = resolveE2eDatabaseUrl({
      env: simulatedProcessEnv,
      envFilePath: envFile,
    });
    simulatedProcessEnv.DATABASE_URL = resolvedUrl;

    // Step 2: Simulated application module imports and reads process.env.DATABASE_URL
    const appModuleDbTarget = new URL(simulatedProcessEnv.DATABASE_URL!).pathname;
    expect(appModuleDbTarget).toBe('/csi_gcet_test');

    // Step 3: Verify that if setup fails (e.g. invalid config), an exception halts execution before app init
    const badEnvFile = path.join(tempDir, 'bad.env');
    fs.writeFileSync(badEnvFile, 'DATABASE_URL=postgresql://csi_app:secret123@remote.com:5432/csi_gcet_dev\n');

    let appInitialized = false;
    try {
      resolveE2eDatabaseUrl({
        env: { NODE_ENV: 'test' },
        envFilePath: badEnvFile,
      });
      appInitialized = true;
    } catch {
      // Execution aborted before app initialization
    }

    expect(appInitialized).toBe(false);
  });

  it('19. accepts a URL with omitted port, confirming default port 5432 policy', () => {
    const urlOmittedPort = 'postgresql://csi_app:secret123@localhost/csi_gcet_test';
    const res = validateE2eDatabaseUrl(urlOmittedPort);
    expect(res.hostname).toBe('localhost');
    expect(res.port).toBe('5432');
    expect(res.database).toBe('csi_gcet_test');

    const resolved = resolveE2eDatabaseUrl({ env: { DATABASE_URL: urlOmittedPort } });
    expect(resolved).toBe(urlOmittedPort);
  });

  it('20. handles percent-encoded and normalized pathname edge cases strictly', () => {
    // A. Encoded separator (%2f) creates nested path -> rejected
    const urlEncodedSlash = 'postgresql://csi_app:secret123@localhost:5432/csi%2fgcet_test';
    expect(() => validateE2eDatabaseUrl(urlEncodedSlash)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi\/gcet_test"/,
    );

    // B. Encoded valid letters (%63 = 'c') decodes to valid csi_gcet_test -> accepted
    const urlEncodedLetters = 'postgresql://csi_app:secret123@localhost:5432/%63si_gcet_test';
    const res = validateE2eDatabaseUrl(urlEncodedLetters);
    expect(res.database).toBe('csi_gcet_test');

    // C. Encoded trailing slash (%2F) -> rejected
    const urlEncodedTrailingSlash = 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_test%2F';
    expect(() => validateE2eDatabaseUrl(urlEncodedTrailingSlash)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi_gcet_test\/"/,
    );

    // D. Path traversal (/../csi_gcet_dev) normalizes to csi_gcet_dev -> rejected
    const urlTraversal = 'postgresql://csi_app:secret123@localhost:5432/csi_gcet_test/../csi_gcet_dev';
    expect(() => validateE2eDatabaseUrl(urlTraversal)).toThrow(
      /\[SAFETY FATAL\] Database target violation: database is "csi_gcet_dev"/,
    );

    // E. Invalid percent-encoding sequence -> rejected safely
    const urlInvalidEncoding = 'postgresql://csi_app:secret123@localhost:5432/csi%E0%A4%Agcet_test';
    expect(() => validateE2eDatabaseUrl(urlInvalidEncoding)).toThrow(
      /\[SAFETY FATAL\] Database pathname violation: pathname contains invalid percent-encoding/,
    );
  });

  it('21. confirms zero discrepancy between URL validation and live database guard policy', async () => {
    // Both URL validation and live guard must allow strictly 'csi_gcet_test'
    const validUrl = 'postgresql://csi_app:pass@localhost:5432/csi_gcet_test';
    expect(validateE2eDatabaseUrl(validUrl).database).toBe('csi_gcet_test');

    const mockPrismaValid = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'csi_gcet_test' }]),
    };
    await expect(assertStrictTestDatabase(mockPrismaValid)).resolves.toBe('csi_gcet_test');

    // Both must reject 'csi_gcet_dev'
    const devUrl = 'postgresql://csi_app:pass@localhost:5432/csi_gcet_dev';
    expect(() => validateE2eDatabaseUrl(devUrl)).toThrow(
      /Database target violation: database is "csi_gcet_dev"/,
    );
    const mockPrismaDev = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'csi_gcet_dev' }]),
    };
    await expect(assertStrictTestDatabase(mockPrismaDev)).rejects.toThrow(
      /Database target violation: live database is "csi_gcet_dev"/,
    );

    // Both must reject arbitrary databases
    const otherUrl = 'postgresql://csi_app:pass@localhost:5432/other_db';
    expect(() => validateE2eDatabaseUrl(otherUrl)).toThrow(
      /Database target violation: database is "other_db"/,
    );
    const mockPrismaOther = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_database: 'other_db' }]),
    };
    await expect(assertStrictTestDatabase(mockPrismaOther)).rejects.toThrow(
      /Database target violation: live database is "other_db"/,
    );
  });

  it('22. enforces serial execution in jest-e2e.json via maxWorkers: 1 (Batch 20)', () => {
    const jestE2eConfigPath = path.resolve(__dirname, '../../../../../apps/api/jest-e2e.json');
    expect(fs.existsSync(jestE2eConfigPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(jestE2eConfigPath, 'utf-8'));
    expect(config.maxWorkers).toBe(1);
  });

  it('23. enforces --runInBand in apps/api/package.json test:e2e script (Batch 20)', () => {
    const pkgPath = path.resolve(__dirname, '../../../../../apps/api/package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts?.['test:e2e']).toContain('--runInBand');
  });
});





