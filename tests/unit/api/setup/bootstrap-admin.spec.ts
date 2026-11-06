import {
  isProductionFlagActive,
  validateHostSafety,
  validateDatabaseNameSafety,
  ALLOWED_LOCAL_HOSTS,
  ALLOWED_BOOTSTRAP_DATABASES,
} from '../../../../scripts/setup/bootstrap-admin';

describe('Administrator Bootstrap Safety & Remote/Production Guard (TASK-011 / B13)', () => {
  describe('isProductionFlagActive', () => {
    it('detects --production CLI flag', () => {
      expect(isProductionFlagActive(['--production'], {})).toBe(true);
      expect(isProductionFlagActive(['--email=admin@gcet.edu', '--production'], {})).toBe(true);
    });

    it('detects --remote CLI flag alias', () => {
      expect(isProductionFlagActive(['--remote'], {})).toBe(true);
    });

    it('detects ALLOW_PRODUCTION_BOOTSTRAP environment variable', () => {
      expect(isProductionFlagActive([], { ALLOW_PRODUCTION_BOOTSTRAP: 'true' })).toBe(true);
    });

    it('returns false when neither CLI flag nor env variable is present', () => {
      expect(isProductionFlagActive([], {})).toBe(false);
      expect(isProductionFlagActive(['--email=admin@gcet.edu', '--name=Admin'], {})).toBe(false);
    });
  });

  describe('validateHostSafety', () => {
    it('permits localhost and loopback interfaces in local mode', () => {
      for (const host of ALLOWED_LOCAL_HOSTS) {
        const check = validateHostSafety(host, false);
        expect(check.allowed).toBe(true);
        expect(check.error).toBeUndefined();
      }
    });

    it('refuses remote hostnames in local mode without --production', () => {
      const remoteHosts = [
        'aws-rds.postgresql.com',
        'db.csi-gcet.org',
        '10.0.0.15',
        '192.168.1.100',
        'supabase.co',
      ];

      for (const host of remoteHosts) {
        const check = validateHostSafety(host, false);
        expect(check.allowed).toBe(false);
        expect(check.error).toMatch(/Refused execution against non-local host/);
        expect(check.error).toMatch(/--production/);
      }
    });

    it('permits remote hostnames when --production is enabled', () => {
      const check = validateHostSafety('aws-rds.postgresql.com', true);
      expect(check.allowed).toBe(true);
      expect(check.error).toBeUndefined();
    });
  });

  describe('validateDatabaseNameSafety', () => {
    it('permits standard local dev and test database names', () => {
      for (const dbName of ALLOWED_BOOTSTRAP_DATABASES) {
        const check = validateDatabaseNameSafety(dbName, false);
        expect(check.allowed).toBe(true);
        expect(check.error).toBeUndefined();
      }
    });

    it('refuses production or arbitrary database names in local mode without --production', () => {
      const prodDatabases = ['csi_gcet_prod', 'csi_production', 'postgres', 'production_db'];

      for (const dbName of prodDatabases) {
        const check = validateDatabaseNameSafety(dbName, false);
        expect(check.allowed).toBe(false);
        expect(check.error).toMatch(/strictly restricted to approved local databases/);
        expect(check.error).toMatch(/--production/);
      }
    });

    it('permits production database names when --production is enabled', () => {
      const check = validateDatabaseNameSafety('csi_gcet_prod', true);
      expect(check.allowed).toBe(true);
      expect(check.error).toBeUndefined();
    });
  });
});

