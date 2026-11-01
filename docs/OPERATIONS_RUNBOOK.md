# CSI GCET Student Branch Platform — Operations Runbook

**Audience:** Student Branch Webmasters, System Administrators, DevOps Engineers  
**System:** CSI GCET Student Branch Official Web Platform  
**Document Classification:** Internal Operational Runbook  
**Last Updated:** November 1, 2026 (Module M19)  

---

## 1. Environment & Architecture Overview

### 1.1 High-Level Architecture
The platform is organized as an npm workspace monorepo running natively without Docker:

- **Frontend (`apps/web`):** Next.js 15.5+ App Router, React 19, Tailwind CSS with permanent light-theme "Indigo Lattice" design tokens. Prerendered static pages with Incremental Static Regeneration (ISR) and client-side hydration.
- **Backend API (`apps/api`):** NestJS 11+ on Express adapter, Prisma ORM, Pino structured logging, Helmet security headers, Express sliding-window rate limiting.
- **Shared Contracts (`packages/shared`):** Zod domain schemas, permission matrix, role codes, and error envelopes bundled via `tsup`.
- **Database:** PostgreSQL 16+ running natively on local host (port 5432).
  - `csi_migrator`: DDL migration owner (possesses schema creation and table management rights).
  - `csi_app`: Runtime DML user (restricted to `SELECT`, `INSERT`, `UPDATE`, `DELETE`; strictly forbidden from altering schema).
  - `audit_log`: Append-only tamper-evident ledger protected by PostgreSQL trigger `prevent_audit_log_mutation` forbidding `UPDATE`, `DELETE`, and `TRUNCATE`.
- **File Storage:** Local path-jailed filesystem storage under `apps/api/storage`:
  - `certificates/`: Generated certificate PDF archives and batch outputs.
  - `passports/`: Deterministic student activity passport PDF dossiers.
  - `workspaces/assets/`: Promotional banners, media posters, and documentation files.
  - `backups/`: Automated timestamped PostgreSQL custom archives (`.dump`) and manifests (`.json`).

### 1.2 Required Runtime Versions
- **Node.js:** `>= 24.0.0` (Active LTS)
- **npm:** `>= 11.0.0`
- **PostgreSQL:** `>= 16.0` (Native system installation with `citext` and `btree_gist` extensions)
- **PostgreSQL CLI Tools:** `pg_dump`, `pg_restore`, `psql` in system PATH

### 1.3 Required Environment Variables
All configuration is strictly validated at startup via `apps/api/src/config/env.ts` using Zod. Never hardcode credentials.

| Variable Name | Required By | Description / Purpose | Secret? |
|---|---|---|:---:|
| `PORT` | API | HTTP listening port (default: `4000`) | No |
| `NODE_ENV` | API / Web | Environment mode (`development`, `test`, `production`) | No |
| `DATABASE_URL` | API | Runtime database connection string using `csi_app` role | **YES** |
| `MIGRATION_DATABASE_URL` | API / Scripts | DDL database connection string using `csi_migrator` role | **YES** |
| `SESSION_SECRET` | API | Cryptographic salt and session cookie signing key (>= 32 chars) | **YES** |
| `CSRF_SECRET` | API | CSRF double-submit token verification secret (>= 32 chars) | **YES** |
| `APP_ENCRYPTION_KEY` | API | 32-byte hexadecimal AES-256-GCM encryption key for secrets at rest | **YES** |
| `STORAGE_ROOT_DIR` | API | Absolute or relative path to private file storage directory | No |
| `TRUST_PROXY_HOPS` | API | Number of trusted reverse proxy hops (integer >= 0, never boolean) | No |
| `PUBLIC_APP_URL` | API / Web | Fully qualified public URL for web frontend (e.g. `https://csi.gcet.edu.in`) | No |
| `API_INTERNAL_URL` | Web | Server-to-server internal URL for API requests (e.g. `http://localhost:4000`) | No |

---

## 2. Initial Setup & Bootstrapping

### 2.1 Repository Cloning & Dependency Installation
```bash
git clone https://github.com/vedantmandanka47/CSI.git CSI-main
cd CSI-main
npm install
```

### 2.2 Environment Configuration
Copy `.env.example` templates and populate them with environment-specific secrets generated via `npm run gen:secrets`:
```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run gen:secrets
```

### 2.3 Native PostgreSQL Setup
Connect as the system `postgres` superuser to create required database roles and extensions:
```sql
-- Create database roles
CREATE ROLE csi_migrator LOGIN PASSWORD '<choose-migrator-password>' CREATEDB;
CREATE ROLE csi_app LOGIN PASSWORD '<choose-app-password>';

-- Create development and test databases
CREATE DATABASE csi_gcet_dev OWNER csi_migrator;
CREATE DATABASE csi_gcet_test OWNER csi_migrator;

-- Install required extensions and grant permissions on csi_gcet_dev
\c csi_gcet_dev
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
GRANT CONNECT ON DATABASE csi_gcet_dev TO csi_app;
GRANT USAGE ON SCHEMA public TO csi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO csi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csi_app;

-- Install required extensions and grant permissions on csi_gcet_test
\c csi_gcet_test
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
GRANT CONNECT ON DATABASE csi_gcet_test TO csi_app;
GRANT USAGE ON SCHEMA public TO csi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO csi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csi_app;
```

### 2.4 Database Migration & Administrator Bootstrap
Run migrations to build the schema, then bootstrap the initial branch administrator:
```bash
# Apply migrations to development database
npm run db:migrate:deploy

# Bootstrap initial super-administrator
npm run bootstrap:admin
```

### 2.5 Starting the Application
```bash
# Build shared library first
npm run build:shared

# Start development servers (concurrent API + Web)
npm run dev

# Or build and start production runtime
npm run build
npm run start
```

### 2.6 Health Verification
Verify running services via HTTP endpoints:
- Liveness Probe: `curl http://localhost:4000/api/health` $\to$ `{"status":"ok"}`
- Readiness Probe (Database & Storage check): `curl http://localhost:4000/api/health/ready` $\to$ `{"status":"ready"}`
- Frontend Health Page: Visit `http://localhost:3000/health` in your browser.

---

## 3. Routine Operations & Maintenance

### 3.1 Automated Database Backups
Execute a manual or cron-scheduled database backup with Table of Contents validation:
```bash
# Generate full compressed backup with SHA-256 manifest and file storage assets
npm run backup

# Backup a specific database with custom retention count
npx tsx scripts/database/backup.ts --database csi_gcet_dev --keep 14

# Verify an existing backup archive without taking a new one
npx tsx scripts/database/backup.ts --verify-only storage/backups/csi_backup_csi_gcet_dev_20261101T141137_94cef0c0.dump
```

Recommended cron schedule (daily at 02:00 IST):
```cron
0 2 * * * cd /var/www/csi-gcet && /usr/bin/npm run backup >> /var/log/csi-backup.log 2>&1
```

### 3.2 Scheduled Data Retention & Guest Anonymization
Trigger the multi-entity data minimization and retention worker:
```bash
# Execute retention purge via administrative CLI / API probe
curl -X POST http://localhost:4000/api/admin/maintenance/retention/purge \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  --cookie "csi_session=<admin_session>; csi_csrf=<csrf_token>"
```
This automated task:
1. Deletes expired sessions (`sessions.expires_at < now`).
2. Deletes expired verification tokens (`verification_tokens.expires_at < now`).
3. Deletes expired password reset tokens (`password_reset_tokens.expires_at < now`).
4. Deletes expired idempotency records (`idempotency_keys.expires_at < now`).
5. Anonymizes guest attendee PII for events concluded > 90 days ago.
6. Records an audit log entry under `RETENTION_PURGE_EXECUTED`.

### 3.3 Log Monitoring & Inspection
Logs are formatted in structured JSON using Pino with automated PII redaction (passwords, tokens, cookies, authorization headers, email, phone numbers are masked).
```bash
# View live API logs with pretty formatting in development
npm run dev | npx pino-pretty

# Filter production error logs
grep '"level":50' /var/log/csi-api.log | jq .
```

### 3.4 Dependency Vulnerability Audits
```bash
# Audit production dependencies against critical vulnerabilities
npm run audit:deps
```

---

## 4. Deployment Procedure

### 4.1 Pre-Deployment Verification Checklist
Run quality gates locally before promoting changes to production:
```bash
npm run typecheck
npm run lint
npm run test
npm run test:e2e --prefix apps/api
npx tsx scripts/validation/test-venue-exclusion.ts
npm run check:colors
npm run check:contrast
npm run check:content
npm run build
```

### 4.2 Production Deployment Sequence
1. **Pull Latest Release:**
   ```bash
   git pull origin main
   npm ci --omit=dev
   ```
2. **Apply Database Migrations:**
   ```bash
   npm run db:migrate:deploy
   ```
3. **Build Frontend & Shared Contracts:**
   ```bash
   npm run build
   ```
4. **Graceful Service Reload (PM2 / systemd):**
   ```bash
   pm2 reload csi-api --update-env
   pm2 reload csi-web --update-env
   ```
5. **Post-Deployment Verification:**
   ```bash
   curl -f http://localhost:4000/api/health/ready || echo "Deployment degraded!"
   ```

### 4.3 Rollback Plan
If a deployment fails:
1. **Application Rollback:** Revert commit: `git checkout <previous-tag> && npm ci && npm run build`
2. **Database Rollback:** If a migration failed, apply the corresponding hand-crafted `down.sql` in reverse order:
   ```bash
   psql -U csi_migrator -d csi_gcet_dev -f apps/api/prisma/migrations/<migration>/down.sql
   ```

---

## 5. Disaster Recovery & Restoration Procedures

### 5.1 Emergency Restoration Workflow
When a database corruption, host failure, or data loss incident occurs:

1. **Step 1: Locate the Latest Valid Backup:**
   Inspect `storage/backups/` and select the newest `.dump` file.
2. **Step 2: Verify Checksum and Table of Contents:**
   ```bash
   npx tsx scripts/database/restore-drill.ts --verify-only --backup storage/backups/<backup_name>.dump
   ```
   Confirm that the calculated SHA-256 matches the companion `.json` manifest and that `pg_restore --list` displays valid catalog entries.
3. **Step 3: Provision an Isolated Empty Target Database:**
   Never restore over an active populated database.
   ```sql
   sudo -u postgres psql -c "CREATE DATABASE csi_gcet_recovery OWNER csi_migrator;"
   sudo -u postgres psql -d csi_gcet_recovery -c "CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS btree_gist; GRANT ALL ON DATABASE csi_gcet_recovery TO csi_app;"
   ```
4. **Step 4: Execute Restoration:**
   ```bash
   npx tsx scripts/database/restore-drill.ts --target csi_gcet_recovery --backup storage/backups/<backup_name>.dump
   ```
5. **Step 5: Verify Restored Data Integrity:**
   Connect to `csi_gcet_recovery` and verify table counts, latest migration, and sample member/credential records.
6. **Step 6: Restore File Storage Assets:**
   Extract companion `.storage.tar.gz` to the active storage directory:
   ```bash
   tar -xzf storage/backups/<backup_name>.storage.tar.gz -C apps/api/storage/
   ```
7. **Step 7: Reconnect Application Services:**
   Update `DATABASE_URL` in `apps/api/.env` to point to the restored database, restart services, and verify health probes.

---

## 6. Troubleshooting Guide

### 6.1 Database Connection Errors (`ECONNREFUSED` / `P1001`)
- **Symptom:** API fails to start with "Cannot reach database at localhost:5432".
- **Diagnosis:**
  ```bash
  pg_isready -h localhost -p 5432
  sudo systemctl status postgresql
  ```
- **Resolution:** Start or restart PostgreSQL systemd service (`sudo systemctl start postgresql`). Verify port 5432 is not blocked by host firewall.

### 6.2 Target Safety Refusal During Restore Drill
- **Symptom:** `restore-drill.ts` exits with `[SAFETY REFUSAL] Target database contains N active tables`.
- **Cause:** Safety safeguard preventing accidental overwrites of populated databases.
- **Resolution:** Provision a brand new empty database (e.g. `csi_gcet_restore_drill`) or supply an empty scratch target. Never drop an active database without institutional authorization.

### 6.3 Missing Uploaded Assets or `409 CONFLICT` on Downloads
- **Symptom:** Member receives `CERTIFICATE_FILE_UNAVAILABLE` or `PASSPORT_FILE_UNAVAILABLE`.
- **Cause:** Disk file was deleted or moved, triggering the `AUD-CERT-01` anti-forgery fail-safe (preventing unverifiable regeneration).
- **Resolution:** Restore the missing file from the backup storage archive (`.storage.tar.gz`). If file was corrupted, verify SHA-256 checksum against database record.

### 6.4 Rate Limiter Throttling Legitimate Scanner Operations
- **Symptom:** Event registration desk scanners receive HTTP 429 `RATE_LIMITED` on `/api/id-card/verify`.
- **Resolution:** Ensure event desk coordinators are logged in with authenticated accounts holding `ATTENDANCE_TAKE` permission. The IP rate limiter for authenticated scanners is set to 60 req/min per IP.

---

*End of Operations Runbook.*

