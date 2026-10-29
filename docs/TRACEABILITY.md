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

### Module M3: Authentication & Sessions

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-05** | User registration / signup with strict validation and password strength enforcement | `apps/api/src/modules/auth/auth.service.ts`, `@csi/shared` | `auth.service.spec.ts`, `auth.e2e-spec.ts`, `auth-schemas.spec.ts` | **VERIFIED** |
| **FR-06** | Email verification workflow with SHA-256 hashed single-use tokens | `apps/api/src/modules/auth/auth.service.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **FR-07** | Credentials login with Argon2id memory-hard hashing and HttpOnly session cookies | `apps/api/src/modules/auth/auth.service.ts`, `tokens.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts`, `tokens.spec.ts` | **VERIFIED** |
| **FR-08** | Stateful database sessions (`sessions` table) and revocation upon logout | `apps/api/src/modules/auth/auth.service.ts`, `auth.middleware.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **FR-09** | Password reset flow invalidating all active user sessions | `apps/api/src/modules/auth/auth.service.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **ARCH-14 / SEC-04** | CSRF protection enforcing `X-CSRF-Token` header and `csi_csrf` cookie on mutating HTTP verbs | `apps/api/src/common/guards/csrf.guard.ts` | `csrf.guard.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **SEC-05 / SEC-06** | Sliding-window rate limiting on auth endpoints emitting standard 429 `RATE_LIMITED` | `apps/api/src/common/services/rate-limiter.service.ts` | `rate-limiter.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **SEC-23** | Append-only audit log tracking every authentication and credential mutation | `apps/api/src/modules/auth/auth.service.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **ARCH-05** | Deny-by-default access control supporting `@Public()`, `@Authenticated()`, and `@RequirePermission()` | `apps/api/src/common/guards/deny-by-default.guard.ts` | `deny-by-default.guard.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |

### Module M4: RBAC, Guards & Audit Logging Consolidation

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **ARCH-05** | Strict deny-by-default on all endpoints; unannotated routes fail closed with 403 Forbidden | `apps/api/src/common/guards/deny-by-default.guard.ts` | `deny-by-default.guard.spec.ts`, `rbac-audit.e2e-spec.ts` | **VERIFIED** |
| **ARCH-06** | Per-request RBAC evaluation directly from PostgreSQL; role mutations take immediate effect without relogin | `apps/api/src/common/middleware/auth.middleware.ts` | `rbac-audit.e2e-spec.ts` (dynamic role escalation test) | **VERIFIED** |
| **SEC-23** | Database-level trigger (`prevent_audit_log_mutation`) blocking all UPDATE, DELETE, and TRUNCATE attempts | `apps/api/prisma/migrations/20261028000000_init_foundation/migration.sql` | `scripts/test-migration-lifecycle.ts`, `rbac-audit.e2e-spec.ts` | **VERIFIED** |
| **FR-10** | Protected audit log querying (`GET /api/audit-logs`) requiring `audit.view` permission with indexed filtering | `apps/api/src/modules/audit-logs/audit-logs.controller.ts`, `audit-logs.service.ts` | `audit-logs.service.spec.ts`, `audit-log-schemas.spec.ts`, `rbac-audit.e2e-spec.ts` | **VERIFIED** |

### Module M5: Web Base (Shell, Theme, Navigation & Auth UI)

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **UI-01 / ADR-002** | "Indigo Lattice" design tokens strictly in `tokens.css`; zero hardcoded color literals | `apps/web/src/styles/tokens.css`, `tailwind.config.ts` | `scripts/check-hardcoded-colors.mjs`, `scripts/check-contrast.mjs` | **VERIFIED** |
| **UI-02** | Distinct operational, loading, and error states handled in UI | `apps/web/src/app/health/page.tsx`, `apps/web/src/app/login/page.tsx` | Next.js build prerender & component tests | **VERIFIED** |
| **ADR-003** | Motion policy: micro-interactions < 200ms; `prefers-reduced-motion` honored | `apps/web/src/app/page.tsx`, `navbar.tsx` | Static inspection & Tailwind transition tokens | **VERIFIED** |
| **ARCH-14 / SEC-04** | Client-side API client auto-injects `X-CSRF-Token` header on mutating requests | `apps/web/src/lib/api-client.ts` | `apps/web/src/lib/api-client.spec.ts` | **VERIFIED** |
| **FR-11** | Responsive layout shell with official CSI logo, auth state context, and complete auth page flows | `apps/web/src/app/layout.tsx`, `navbar.tsx`, `footer.tsx`, `app/(auth)/*` | Next.js static build (14/14 pages) & Vitest | **VERIFIED** |





