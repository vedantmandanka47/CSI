# Repository Structural Organization & Test Centralization Report

## Executive Summary

Prior to initiating Phase 4 (Module M14: Student Activity Passport & Extracurricular Dossier) and the comprehensive project audit, this structural refactoring reorganized the CSI GCET Student Branch monorepo codebase. All automated tests were centralized into a top-level root directory, internal service modules with complex responsibilities (`Admin` and `Certificates`) were partitioned into clean functional subdirectories with explicit barrel exports, and root-level scripts were categorized by their operational purpose.

All 46 test suites and 353 test cases were completely preserved without weakening any assertions. All workspaces (`@csi/api`, `@csi/web`, `@csi/shared`) build cleanly, pass strict TypeScript typechecking, pass zero-warning ESLint validation, and fulfill all automated security, accessibility, and content compliance checks.

---

## 1. Directory Structure Reorganization

### 1.1 Centralized Root Test Architecture (`tests/`)

Previously, tests were fragmented across application source trees (`apps/api/src/**/*.spec.ts`, `apps/api/test/**/*.e2e-spec.ts`, `apps/web/src/**/*.spec.ts`, and `packages/shared/tests/**/*.spec.ts`). All test suites and helpers have now been migrated into a unified root-level `tests/` hierarchy:

```text
tests/
├── unit/
│   ├── api/
│   │   ├── common/
│   │   │   ├── crypto/
│   │   │   │   ├── tokens.spec.ts
│   │   │   │   └── totp.spec.ts
│   │   │   ├── filters/
│   │   │   │   └── global-exception.filter.spec.ts
│   │   │   ├── guards/
│   │   │   │   ├── csrf.guard.spec.ts
│   │   │   │   ├── deny-by-default.guard.spec.ts
│   │   │   │   └── test-db-guard.spec.ts
│   │   │   ├── middleware/
│   │   │   │   └── request-id.middleware.spec.ts
│   │   │   └── services/
│   │   │       └── rate-limiter.service.spec.ts
│   │   ├── config/
│   │   │   └── env.spec.ts
│   │   └── modules/
│   │       ├── admin/
│   │       │   ├── drive-windows.service.spec.ts
│   │       │   └── member-admin.service.spec.ts
│   │       ├── attendance/
│   │       │   └── attendance.service.spec.ts
│   │       ├── audit-logs/
│   │       │   └── audit-logs.service.spec.ts
│   │       ├── auth/
│   │       │   └── auth.service.spec.ts
│   │       ├── certificates/
│   │       │   ├── certificate-batch.service.spec.ts
│   │       │   ├── certificate-engine.service.spec.ts
│   │       │   └── certificate-verification.service.spec.ts
│   │       ├── committees/
│   │       │   └── committees.service.spec.ts
│   │       ├── dashboard/
│   │       │   └── dashboard.service.spec.ts
│   │       ├── events/
│   │       │   └── events.service.spec.ts
│   │       ├── health/
│   │       │   └── health.service.spec.ts
│   │       ├── id-card/
│   │       │   └── id-card.service.spec.ts
│   │       ├── public/
│   │       │   └── public.service.spec.ts
│   │       ├── roles/
│   │       │   └── roles.service.spec.ts
│   │       └── users/
│   │           └── users.service.spec.ts
│   ├── web/
│   │   ├── api-client.spec.ts
│   │   └── offline-queue.spec.ts
│   └── shared/
│       ├── __snapshots__/
│       │   └── check-content.spec.ts.snap
│       ├── audit-log-schemas.spec.ts
│       ├── auth-schemas.spec.ts
│       ├── certificate-batch-schemas.spec.ts
│       ├── certificate-template-schemas.spec.ts
│       ├── certificate-verification-schemas.spec.ts
│       ├── check-content.spec.ts
│       ├── event-schema.spec.ts
│       ├── m8-schemas.spec.ts
│       ├── m9-schemas.spec.ts
│       ├── m10-schemas.spec.ts
│       ├── permission-matrix.spec.ts
│       └── public-status-schema.spec.ts
├── e2e/
│   ├── app.e2e-spec.ts
│   ├── auth.e2e-spec.ts
│   ├── certificate-batch.e2e-spec.ts
│   ├── certificate-verification.e2e-spec.ts
│   ├── certificates.e2e-spec.ts
│   └── rbac-audit.e2e-spec.ts
└── helpers/
    └── setup-e2e.ts
```

### 1.2 Admin Module Domain Partitioning (`apps/api/src/modules/admin/`)

The flat `admin/` module was partitioned into domain-specific subdirectories with an index barrel export:

```text
apps/api/src/modules/admin/
├── drives/
│   ├── drive-windows.service.ts
│   └── drives.controller.ts
├── members/
│   ├── member-admin.service.ts
│   └── members.controller.ts
├── admin.module.ts
└── index.ts
```

### 1.3 Certificates Module Functional Partitioning (`apps/api/src/modules/certificates/`)

The `certificates/` module, spanning M11, M12, and M13 implementations, was structured into clean functional responsibility subpackages:

```text
apps/api/src/modules/certificates/
├── templates/
│   ├── certificate-template-engine.service.ts
│   ├── font-manager.service.ts
│   ├── layout-engine.service.ts
│   └── asset-manager.service.ts
├── issuance/
│   ├── certificate-issuance.service.ts
│   ├── participant-resolver.service.ts
│   └── certificate-number-generator.service.ts
├── batches/
│   └── certificate-batch-processor.service.ts
├── storage/
│   └── certificate-storage.service.ts
├── verification/
│   ├── verification-code.service.ts
│   ├── certificate-verification.service.ts
│   └── public-verification-rate-limit.guard.ts
├── controllers/
│   ├── certificates.controller.ts
│   ├── me-certificates.controller.ts
│   └── public-verification.controller.ts
├── certificates.module.ts
└── index.ts
```

### 1.4 Script Categorization (`scripts/`)

Operational and validation scripts were categorized into distinct purpose-driven directories:

```text
scripts/
├── database/
│   ├── db-setup.sql
│   ├── db-reset-dev.ts
│   └── test-migration-lifecycle.ts
├── development/
│   └── gen-secrets.mjs
├── setup/
│   └── bootstrap-admin.ts
└── validation/
    ├── check-contrast.mjs
    ├── check-hardcoded-colors.mjs
    ├── check-content.mjs
    ├── test-proxy.ts
    └── test-venue-exclusion.ts
```

---

## 2. Configuration & Tooling Updates

1. **NestJS / API Jest Configuration (`apps/api/package.json` & `apps/api/jest-e2e.json`):**
   - Configured `rootDir: "../.."` with roots mapping `<rootDir>/tests/unit/api` and `<rootDir>/apps/api/src`.
   - Explicitly wired `ts-jest` to use `<rootDir>/apps/api/tsconfig.json` so that NestJS decorator metadata and experimental decorators are properly preserved during test runs.
   - Configured E2E harness in `jest-e2e.json` with `setupFiles: ["<rootDir>/tests/helpers/setup-e2e.ts"]`.

2. **Web Vitest Configuration (`apps/web/vitest.config.ts`):**
   - Configured `include: ['../../tests/unit/web/**/*.spec.ts']` with path alias `@/` mapping to `resolve(__dirname, './src')`.

3. **Shared Vitest Configuration (`packages/shared/vitest.config.ts`):**
   - Configured `include: ['../../tests/unit/shared/**/*.spec.ts']` with path alias `@csi/shared` mapping to `resolve(__dirname, './src')`.

4. **TypeScript Configuration (`tsconfig.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`):**
   - Added root `tsconfig.json` referencing `scripts/` and `tests/`.
   - Updated `apps/api/tsconfig.json` to include `../../tests/unit/api/**/*` and `../../tests/e2e/**/*` for editor typechecking and test compilation.
   - Updated `apps/api/tsconfig.build.json` to exclude `../../tests` ensuring build outputs (`dist/`) contain strictly production runtime artifacts.

5. **NPM Scripts & CI Workflow (`package.json`, `.github/workflows/ci.yml`):**
   - Updated all script invocations (`check:colors`, `check:contrast`, `check:content`, `gen:secrets`, `bootstrap:admin`, `db:reset:dev`, `test:venue-exclusion`, `test:migration:lifecycle`) to use the new categorized paths.
   - Updated GitHub Actions CI workflow steps accordingly.

---

## 3. Verification & Test Gate Results

| Check / Gate | Target | Result | Test Counts / Details |
|---|---|:---:|---|
| **Zero Hardcoded Colors** | `apps/web/src` | **PASS** | 71 files checked, 0 literals outside `tokens.css` |
| **WCAG 2.2 AA Contrast** | `tokens.css` | **PASS** | All light theme pairings exceed 4.5:1 ratio |
| **Content & Compliance Scan** | `apps/web/src` | **PASS** | 43 files scanned, 0 placeholders, 0 dead hrefs |
| **Monorepo Strict Typecheck** | `@csi/api`, `@csi/web`, `@csi/shared` | **PASS** | `tsc --noEmit` exited 0 across all workspaces |
| **Monorepo ESLint** | Entire repository | **PASS** | 0 errors, 0 warnings across all files |
| **API Unit Tests** | `tests/unit/api/` | **PASS** | 26 test suites, 194 tests passed |
| **Web Unit Tests** | `tests/unit/web/` | **PASS** | 2 test files, 5 tests passed |
| **Shared Unit Tests** | `tests/unit/shared/` | **PASS** | 12 test files, 81 tests passed |
| **API E2E Tests** | `tests/e2e/` (on `csi_gcet_test`) | **PASS** | 6 test suites, 73 tests passed |
| **Total Automated Tests** | Root `tests/` | **PASS** | **46 test suites, 353 tests (100% pass rate)** |
| **Monorepo Production Build** | Full build | **PASS** | `nest build`, `next build` (22 pages), `tsup` |

---

## 4. Preservation & Safety Invariants Verified

- **Active Directory:** `C:\Users\HP\Desktop\Vedant\CSI-main` on branch `main`.
- **Preserved Directory:** `C:\Users\HP\Desktop\Vedant\CSI` on branch `remediation-u1-u4` remained untouched.
- **Environment File:** `apps/api/.env` was not modified.
- **Databases:** `csi_gcet_dev` remains intact with its 4 baseline persistent users; `csi_gcet_test` was used exclusively for test executions. Zero Docker used. Single light mode preserved.
