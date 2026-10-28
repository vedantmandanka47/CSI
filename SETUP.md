# Local Environment Setup Guide (Docker-Free)

This document provides the exact, step-by-step procedure to set up, initialize, and verify the CSI GCET SB platform from a clean clone.

---

## 1. Prerequisites

Verify that your local system has the required tooling installed:

```bash
node -v    # Must be >= v24.0.0 (see .nvmrc)
npm -v     # Must be >= v11.0.0
psql -V    # PostgreSQL CLI client (PostgreSQL 16+ or 18+)
git -v     # Git version control
```

PostgreSQL must be running locally on `localhost:5432`.

---

## 2. One-Time Database Setup

Connect to PostgreSQL as a superuser (`postgres`) and execute the database setup script:

```bash
# In psql:
psql -U postgres -f scripts/db-setup.sql
```

This creates:
- Roles: `csi_migrator` (schema owner & DDL) and `csi_app` (runtime DML only).
- Databases: `csi_gcet_dev` and `csi_gcet_test`.
- Extensions: `citext` and `btree_gist`.
- Default privileges: Grants DML permissions on public schema tables to `csi_app`.

---

## 3. Environment Configuration

Copy the example environment files for both applications:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### Generate Cryptographic Secrets
Run the secret generator to print fresh cryptographic secrets to stdout:

```bash
npm run gen:secrets
```

Copy the generated secrets into `apps/api/.env`:
- `SESSION_SECRET` (>= 32 random bytes)
- `CSRF_SECRET` (>= 32 random bytes)
- `APP_ENCRYPTION_KEY` (32 bytes hex for AES-256-GCM)
- `QR_KEY_ID`, `QR_SIGNING_PUBLIC_KEY`, `QR_SIGNING_PRIVATE_KEY` (Ed25519)

Ensure the database passwords in `DATABASE_URL` and `MIGRATION_DATABASE_URL` match your local setup.

---

## 4. Install Dependencies

Install all monorepo dependencies using the committed lockfile:

```bash
npm ci
```

---

## 5. Database Migration and Seeding

Apply Prisma migrations and seed the initial roles and committees:

```bash
# Run migrations on csi_gcet_dev using csi_migrator role
npm run db:migrate

# Seed initial 8 roles and 4 committees (no demo users per Hard Rule 8)
npm run db:seed
```

---

## 6. First Administrator Creation

Bootstrap the initial administrator account interactively:

```bash
npm run bootstrap:admin
```
Follow the prompts to enter your administrator email and choose or generate a secure one-time password.

---

## 7. Verification Gates

Run all quality checks to verify the installation:

```bash
npm run check:colors      # Zero color literals outside tokens.css
npm run check:contrast    # WCAG 2.2 AA contrast ratios satisfied
npm run check:content     # No [CONTENT NEEDED] or banned compliance phrases
npm run lint              # ESLint across all workspaces and scripts
npm run typecheck         # TypeScript strict compilation
npm run test              # Jest & Vitest unit and integration suites
npm run build             # Full monorepo production build
```

---

## 8. Running Development Servers

Start both the NestJS API (`http://localhost:4000`) and the Next.js frontend (`http://localhost:3000`) concurrently:

```bash
npm run dev
```

Navigate to `http://localhost:3000/health` in your browser to verify that the Next.js reverse proxy connects end-to-end with the NestJS API.
