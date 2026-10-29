# Requirements Traceability Matrix

This matrix maps every functional requirement (`FR-`), architectural rule (`ARCH-`), security rule (`SEC-`), dependency rule (`DEP-`), and user interface rule (`UI-`) to its implementing code and automated test suites (Section 10.5 & Section 11 Gate).

---

## Phase 1 — Trustworthy Base

### Module M1: Errors, Env, Logging & Health Consolidation

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **ARCH-05** | Server-side deny-by-default authorization guard | `apps/api/src/common/guards/deny-by-default.guard.ts` | `apps/api/src/common/guards/deny-by-default.guard.spec.ts` | **VERIFIED** |
| **ARCH-15** | Standard error envelope (`{ error: { code, message, fields } }`), zero stack trace leaks in production | `apps/api/src/common/filters/global-exception.filter.ts` | `apps/api/src/common/filters/global-exception.filter.spec.ts`, `apps/api/test/app.e2e-spec.ts` | **VERIFIED** |
| **ARCH-16** | Strict Zod validation of environment variables; `env.ts` is sole reader of `process.env` | `apps/api/src/config/env.ts` | `apps/api/src/config/env.spec.ts` | **VERIFIED** |
| **ARCH-19** | `trust proxy` configured with exact hop count (never boolean `true`) | `apps/api/src/config/env.ts`, `apps/api/src/main.ts` | `apps/api/src/config/env.spec.ts` | **VERIFIED** |
| **SEC-02** | Security headers enforced via Helmet and `no-store` on error responses | `apps/api/src/main.ts`, `apps/api/src/common/filters/global-exception.filter.ts` | `apps/api/src/common/filters/global-exception.filter.spec.ts`, `apps/api/test/app.e2e-spec.ts` | **VERIFIED** |
| **SEC-24** | Automated PII redaction in structured Pino application logs | `apps/api/src/app.module.ts` | Pino configuration inspection; manual test | **VERIFIED** |
| **DEP-13** | Health endpoints: `/api/health` (liveness) and `/api/health/ready` (database check) | `apps/api/src/modules/health/health.controller.ts`, `health.service.ts` | `apps/api/src/modules/health/health.service.spec.ts`, `apps/api/test/app.e2e-spec.ts` | **VERIFIED** |
| **DEP-14** | Local storage driver forbidden in production; fails at startup | `apps/api/src/config/env.ts` | `apps/api/src/config/env.spec.ts` | **VERIFIED** |
| **UI-02** | Distinct operational, degraded, loading, and error states handled in UI | `apps/web/src/app/health/page.tsx` | Next.js build prerender & manual health probe | **VERIFIED** |

### Module M2: Users, Roles, Committees, Role Assignments & Roster

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-01** | User model, status lifecycle (`pending`, `active`, `inactive`, `suspended`), paginated listing | `apps/api/src/modules/users/users.service.ts`, `users.controller.ts`, `@csi/shared` | `apps/api/src/modules/users/users.service.spec.ts` | **VERIFIED** |
| **FR-02** | System roles, hierarchy lookup, committee-scoped roles | `apps/api/src/modules/roles/roles.service.ts`, `roles.controller.ts`, `@csi/shared` | `apps/api/src/modules/roles/roles.service.spec.ts` | **VERIFIED** |
| **FR-03** | Committees management and role assignment tracking | `apps/api/src/modules/committees/committees.service.ts`, `committees.controller.ts` | `apps/api/src/modules/committees/committees.service.spec.ts` | **VERIFIED** |
| **FR-04** | Roster entry validation and import schemas | `@csi/shared/src/schemas/roster.schema.ts`, `apps/api/prisma/schema.prisma` | Vitest `@csi/shared` test suite, migration tests | **VERIFIED** |
| **SEC-23** | Append-only audit log entries for status mutations and role assignment changes | `apps/api/src/modules/users/users.service.ts`, `scripts/bootstrap-admin.ts` | `apps/api/src/modules/users/users.service.spec.ts` | **VERIFIED** |
| **DEP-03 / PRIV-13** | Argon2id memory-hard hashing algorithm for privileged credentials | `apps/api/package.json` (`argon2`), `scripts/bootstrap-admin.ts` | `scripts/bootstrap-admin.ts` verified on `csi_gcet_dev` | **VERIFIED** |
| **Q-ADMIN-01** | Sparse unique index on nullable `enrollment_no` for non-student administrators | `apps/api/prisma/migrations/20261029000000_users_roles_roster/migration.sql` | `scripts/test-migration-lifecycle.ts` UP/DOWN test | **VERIFIED** |


