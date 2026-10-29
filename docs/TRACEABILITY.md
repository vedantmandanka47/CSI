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
