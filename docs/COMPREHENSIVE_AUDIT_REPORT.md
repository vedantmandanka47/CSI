# Comprehensive Technical Audit Report
## CSI GCET Student Branch Platform
**Audit Milestone:** Post-Phase 3, Post-Repository Structural Organization  
**Target Repository:** `C:\Users\HP\Desktop\Vedant\CSI-main`  
**Target Branch:** `main`  
**Organization Baseline Commit:** `2a83e97a08e16cbae38c5f4a9e323fb059aed7d4` (`2a83e97`)  
**Auditor Roles:** Senior Software Architect, Application Security Engineer, Systems Engineer  
**Date:** October 31, 2026  

---

## Executive Summary

An independent, evidence-based technical audit was conducted across the entire CSI GCET Student Branch Platform codebase following the completion of Phase 3 (Certificates & Verifiable Credentials) and the subsequent repository-wide structural reorganization and test centralization.

The primary objective was to independently establish the actual technical condition of the codebase, verify that implemented features adhere to project specifications, evaluate security controls, assess database integrity, identify residual risks, and determine readiness for **Module M14: Student Activity Passport & Extracurricular Dossier** and eventual production deployment.

### Key Audit Conclusions

1. **Architecture & Structural Integrity:** The repository reorganization successfully centralized 46 test suites into the root `tests/` hierarchy, modularized the `Admin` and `Certificates` modules with clean barrel exports, and categorized operational scripts into purpose-driven folders. Circular dependency analysis (`madge`) verified **0 circular dependencies** across all 120 source files.
2. **Automated Test Health:** All **46 test suites and 353 test cases passed** (100% pass rate) across unit, shared, web, and E2E suites. Zero assertions were weakened or removed.
3. **Database & Data Integrity:** PostgreSQL exclusion constraints (`events_venue_time_excl` via `btree_gist`), append-only audit log triggers (`prevent_audit_log_mutation`), and migration reversibility (10 UP $\to$ 10 DOWN $\to$ 10 UP migrations) were confirmed with 0 failures on `csi_gcet_test`.
4. **Findings Identified:** A total of **13 findings** were identified: **0 Critical, 4 High, 5 Medium, 3 Low, and 1 Informational**.
5. **M14 Readiness Verdict:** **CONDITIONALLY READY.** Module M14 builds directly upon certificate and activity records. One Pre-M14 finding (`AUD-CERT-01`: Fallback certificate PDF regeneration omitting the verification QR badge and producing an integrity mismatch) should be addressed or acknowledged before commencing M14.
6. **Production Readiness Verdict:** **NOT READY.** The 4 High-severity findings (rate limiting bypass via client-spoofed `X-Forwarded-For`, unauthenticated public ID card verification endpoint, idempotency key payload mismatch silently replaying stale results, and missing verification code on fallback regeneration) along with the 5 Medium-severity findings must be remediated prior to production deployment.

---

## 1. Audit Scope & Methodology

### 1.1 Repository Verification
The active worktree at `C:\Users\HP\Desktop\Vedant\CSI-main` was verified against its remote `https://github.com/vedantmandanka47/CSI.git`. The active branch is `main`, fully synchronized with `origin/main` at commit `2a83e97`. The preserved repository at `C:\Users\HP\Desktop\Vedant\CSI` on branch `remediation-u1-u4` was verified to be untouched.

### 1.2 Verification Environment & Commands Executed
All automated validations were executed locally under Docker-free native infrastructure (Node.js 24 + PostgreSQL 18.3) targeting `csi_gcet_test`:

| Verification Gate | Exact Executed Command | Exit Code | Result | Key Metric / Output |
|---|---|:---:|:---:|---|
| **Hardcoded Colors** | `npm run check:colors` | `0` | **PASS** | 71 files checked, 0 color literals outside `tokens.css` |
| **WCAG Contrast** | `npm run check:contrast` | `0` | **PASS** | 6 light theme token pairs verified; all $\ge$ 4.5:1 |
| **Content Integrity** | `npm run check:content` | `0` | **PASS** | 43 web files scanned; 0 placeholders, 0 dead hrefs |
| **Monorepo Lint** | `npm run lint` | `0` | **PASS** | 0 ESLint errors, 0 warnings across all workspaces |
| **Monorepo Typecheck** | `npm run typecheck` | `0` | **PASS** | `tsc --noEmit` exited 0 across `@csi/api`, `@csi/web`, `@csi/shared` |
| **Unit Test Suites** | `npm run test` | `0` | **PASS** | 40 suites (26 API, 2 Web, 12 Shared), 280 tests passed |
| **API E2E Tests** | `npm run test:e2e --prefix apps/api` | `0` | **PASS** | 6 suites, 73 tests passed on `csi_gcet_test` |
| **PostgreSQL Exclusion** | `npx tsx scripts/validation/test-venue-exclusion.ts` | `0` | **PASS** | 6/6 conflict & race scenarios passed on `csi_gcet_test` |
| **Migration Lifecycle** | `npx tsx scripts/database/test-migration-lifecycle.ts` | `0` | **PASS** | 10 UP $\to$ 10 DOWN $\to$ 10 UP migrations verified cleanly |
| **Circular Dependencies** | `npx madge --circular --extensions ts apps/api/src packages/shared/src apps/web/src` | `0` | **PASS** | 120 files processed; 0 circular dependencies found |
| **Monorepo Build** | `npm run build` | `0` | **PASS** | `nest build`, `next build` (22 pages), `tsup` succeeded |
| **Dependency Audit** | `npm audit --omit=dev` | `1` | **KNOWN ADVISORY** | 1 High (`zod <4.6.6` GHSA-mrhx-c7xc-m3w5); documented |

---

## 2. Findings by Technical Domain

### A. Architecture and Code Quality
- **Modularity:** The reorganized `apps/api/src/modules/admin` (`drives/`, `members/`) and `apps/api/src/modules/certificates` (`templates/`, `issuance/`, `batches/`, `storage/`, `verification/`, `controllers/`) subpackages enforce single-responsibility boundaries. Barrel exports ([`admin/index.ts`](file:///C:/Users/HP/Desktop/Vedant/CSI-main/apps/api/src/modules/admin/index.ts) and [`certificates/index.ts`](file:///C:/Users/HP/Desktop/Vedant/CSI-main/apps/api/src/modules/certificates/index.ts)) maintain backwards compatibility without cyclic dependencies.
- **Dependency Flow:** Cleanly decoupled; `@csi/shared` is consumed downstream by `@csi/api` and `@csi/web`. No reverse imports exist.
- **Dead Code:** ESLint rule `@typescript-eslint/no-unused-vars` verified zero unused imports or dead variables.

### B. Database and Data Integrity
- **Schema & Indexes:** 19 relational tables configured in `schema.prisma`. Explicit compound unique constraints enforce business invariants (`(event_id, user_id)` for registrations, `(session_id, subject_type, subject_id)` for attendance, `(event_id, recipient_email, certificate_type)` for certificates).
- **Append-Only Trigger:** `prevent_audit_log_mutation` trigger reliably blocks all `UPDATE`, `DELETE`, and `TRUNCATE` operations on `audit_log`.
- **Exclusion Constraints:** `events_venue_time_excl` mathematically guarantees zero overlapping venue bookings via `btree_gist`.
- **Findings Identified:**
  - `AUD-CERT-02` (High): `IdempotencyKey` lookup does not check `requestHash`, allowing payload mismatch replays.
  - `AUD-DATA-01` (Low): Offline attendance sync with clock skew > 24h uses static fallback UUID causing collision under multiple skewed records.

### C. Authentication and Authorization
- **Credentials & Sessions:** Passwords hashed with Argon2id (`memoryCost: 65536 KiB`, `timeCost: 3`, `parallelism: 1`). Sessions tracked in database `sessions` table, SHA-256 hashed.
- **Access Control:** Server-side deny-by-default enforced via `DenyByDefaultGuard`. All routes require explicit `@Public()`, `@Authenticated()`, or `@RequirePermission()` decorators.
- **CSRF Protection:** Double-submit cookie pattern (`csi_csrf` cookie matched with `X-CSRF-Token` header) enforced on all mutating HTTP verbs.
- **Findings Identified:**
  - `AUD-SEC-02` (High): `POST /api/id-card/verify` is marked `@Public()`, exposing student identities without authentication or rate limiting.
  - `AUD-SEC-03` (Medium): Digital ID card QR pass uses HMAC-SHA256 with `SESSION_SECRET` rather than Ed25519 asymmetric signatures.

### D. API Security and Reliability
- **Error Sanitization:** `GlobalExceptionFilter` intercepts all exceptions, sanitizes internal errors to standard error envelopes, and prevents stack trace or SQL leakage.
- **Input Validation:** Strict Zod parsing on incoming payloads.
- **Findings Identified:**
  - `AUD-SEC-01` (High): Public verification rate limiter parses raw client-supplied `X-Forwarded-For` header instead of sanitized `req.ip`.
  - `AUD-PERF-01` (Medium): `RateLimiterService` lacks key eviction, leading to in-memory growth.

### E. Certificate Subsystem (M11 - M13)
- **M11 Template Engine:** Pure JavaScript vector PDF generation using `pdf-lib` and `@pdf-lib/fontkit`. Zero Puppeteer dependencies. Asset manager enforces directory jail and magic-byte validation (PNG/JPEG). Font manager embeds Standard 14 and custom fonts.
- **M12 Batch Generation:** Chunked background worker (`chunkSize = 10`), deduplication checks, and retry mechanics.
- **M13 Verification & Anti-Forgery:** 80-bit CSPRNG (`randomBytes(10)`) $\to$ 16-character Crockford Base32. Deterministic SHA-256 hash stored in database (`verification_code_hash`). QR code embedded in PDF.
- **Findings Identified:**
  - `AUD-CERT-01` (High): Deterministic fallback regeneration omits `verification_code` and QR badge, causing verification to report `INTEGRITY_MISMATCH`.
  - `AUD-CERT-03` (Low): Process crashes mid-batch leave certificates stuck in `processing` state without an automated timeout recovery mechanism.

### F. Frontend and User Experience
- **Theme Invariant:** Strict, permanent single light theme. Zero dark mode, zero theme switcher, zero OS theme toggling.
- **Design Tokens:** "Indigo Lattice" design tokens strictly centralized in `tokens.css`.
- **Accessibility:** 100% WCAG 2.2 AA contrast compliance across all token pairings.
- **Content:** Zero placeholder copy, dead links, or banned compliance claims across 43 web source files.
- **Findings Identified:**
  - `AUD-TEST-01` (Low): Zero visual or component tests for Next.js App Router routes.

### G. Events, Membership and Attendance
- **Events (M8):** CRUD operations, capacity constraints, ICS calendar feed generation (`events/calendar/feed.ics`), and waitlist mechanics.
- **Membership (M7):** Drive window controls, review lifecycle, and ID card issuance.
- **Attendance (M9):** Dynamic QR scanning, TOTP validation, manual check-in, and offline queue synchronization.
- **Findings Identified:**
  - `AUD-SEC-04` (Medium): Attendance TOTP secrets stored in plaintext at rest in PostgreSQL.

### H. Venue Booking
- **Conflict Prevention (M10):** Native PostgreSQL `btree_gist` Exclusion Constraint (`events_venue_time_excl`) verified via 6 concurrent race and interval tests. Application translates SQLSTATE `23P01` to HTTP 409 `VENUE_CONFLICT`.

### I. Privacy and DPDP Readiness
- **Inventory & Policies:** Documented in `PRIVACY.md`, `DATA_INVENTORY.md`, and `VENDORS.md`. Strict prohibition of national IDs, financial data, and biometric data.
- **Findings Identified:**
  - `AUD-PRIV-01` (Medium): No technical enforcement of retention cleanup (expired sessions, tokens, idempotency keys, and IP retention schedules).

### J. Dependencies and Supply Chain
- **Security Audit:** All 8 previously remediated production vulnerabilities remain resolved.
- **Residual Finding:**
  - `AUD-DEP-01` (Informational): Single remaining production advisory for `zod <4.6.6` (GHSA-mrhx-c7xc-m3w5). Correctly deferred due to breaking API changes; mitigated at the HTTP layer via 100kb body limit and rate limiting.

### K. Continuous Integration (CI)
- **CI Workflow:** `.github/workflows/ci.yml` correctly pins GitHub actions to commit SHAs and executes lint, typecheck, contrast, color, content, migration tests, and build.
- **Findings Identified:**
  - `AUD-CI-01` (Medium): `ci.yml` omits `test:e2e` and `test-venue-exclusion.ts`, and fails on `npm run audit:deps` due to the deferred Zod advisory.

---

## 3. Severity Distribution

```text
Critical:       0
High:           4   (AUD-SEC-01, AUD-CERT-01, AUD-CERT-02, AUD-SEC-02)
Medium:         5   (AUD-SEC-03, AUD-SEC-04, AUD-CI-01, AUD-PRIV-01, AUD-PERF-01)
Low:            3   (AUD-CERT-03, AUD-TEST-01, AUD-DATA-01)
Informational:  1   (AUD-DEP-01)
-----------------
Total Findings: 13
```

---

## 4. Top 10 Priority Findings

1. **`AUD-CERT-01` (High):** Fallback certificate PDF regeneration omits the verification QR badge and produces a checksum mismatch. *(Blocks M14)*
2. **`AUD-SEC-01` (High):** Public verification rate limit bypass via client-supplied `X-Forwarded-For`.
3. **`AUD-SEC-02` (High):** Public unauthenticated ID card verification endpoint exposing student enrollment data without rate limiting.
4. **`AUD-CERT-02` (High):** Idempotency-Key lookup silently replays cached responses on modified payloads.
5. **`AUD-SEC-03` (Medium):** Digital ID card QR pass uses HMAC-SHA256 with session secret instead of Ed25519 asymmetric signatures.
6. **`AUD-SEC-04` (Medium):** Plaintext storage of event attendance TOTP secrets in PostgreSQL.
7. **`AUD-CI-01` (Medium):** CI workflow omits E2E test suites (73 tests) and venue exclusion tests.
8. **`AUD-PRIV-01` (Medium):** Missing automated background cleanup for expired sessions, tokens, and retention schedules.
9. **`AUD-PERF-01` (Medium):** In-memory rate limiter leak due to missing key eviction.
10. **`AUD-CERT-03` (Low):** Worker crash leaves active certificate batches stuck in zombie `processing` state.

---

## 5. Milestone M14 Readiness Assessment

**Decision: CONDITIONALLY READY.**

- **Rationale:** The architectural foundation for Module M14 (Student Activity Passport & Extracurricular Dossier) is structurally sound:
  - `User`, `RoleAssignment`, `Committee`, `Event`, `Registration`, `AttendanceRecord`, and `Certificate` models are fully established with foreign key integrity.
  - The shared contracts, permission matrix, and data querying layers operate reliably with 100% test passing rates.
- **Condition:**
  - Finding **`AUD-CERT-01`** directly touches the certificate retrieval mechanism that M14 will display in student activity dossiers. Before implementing M14, either:
    1. Apply the targeted Pre-M14 fix specified in [`docs/AUDIT_REMEDIATION_PLAN.md`](file:///C:/Users/HP/Desktop/Vedant/CSI-main/docs/AUDIT_REMEDIATION_PLAN.md), OR
    2. Explicitly accept the constraint that M14 will display issued certificates based on persistent storage files without attempting fallback re-rendering if files are missing.

---

## 6. Production Readiness Assessment

**Decision: NOT READY.**

- **Rationale:** Deploying the platform to real student users at GCET currently carries unmitigated risks:
  - Unauthorized scraping of student identity via `POST /api/id-card/verify` (`AUD-SEC-02`).
  - Rate-limit evasion allowing verification code enumeration (`AUD-SEC-01`).
  - Silent batch creation errors via idempotency payload mismatches (`AUD-CERT-02`).
  - Plaintext attendance TOTP secrets at rest (`AUD-SEC-04`).
- **Remediation Requirement:** All 4 High and 5 Medium findings must be resolved and verified prior to production deployment (scheduled for Phase 5: Production Hardening).

---

## 7. Roadmap & Traceability Matrix Compliance

All requirements from Phase 0, Phase 1 (M1–M5), Phase 2 (M6–M10), and Phase 3 (M11–M13) were evaluated against the implementation:

| Module / Milestone | Status | Requirements Verified | Unaddressed Roadmap Items |
|---|:---:|---|---|
| **Phase 0: Foundation Bootstrap** | **VERIFIED** | Monorepo workspaces, Next.js 15, NestJS 11, Prisma, PostgreSQL 18+, Docker-free | None |
| **Module M1: Errors, Env & Logging** | **VERIFIED** | Strict Zod env, standard error envelope, Pino redaction, health checks | None |
| **Module M2: Users, Roles & Roster** | **VERIFIED** | 8 system roles, committee tracking, roster import, audit logs | None |
| **Module M3: Auth & Sessions** | **VERIFIED** | Argon2id hashing, email verification, stateful sessions, CSRF guard | None |
| **Module M4: RBAC & Audit Logging** | **VERIFIED** | Deny-by-default guard, permission matrix, DB append-only trigger | None |
| **Module M5: Membership Review** | **VERIFIED** | Drive windows, application lifecycle, member activation | None |
| **Module M6: Public Landing Experience** | **VERIFIED** | 10 landing sections, ISR prerender, WCAG AA contrast, Indigo Lattice | None |
| **Module M7: Digital ID Card** | **PARTIALLY VERIFIED** | ID card generation, dynamic rotating QR token | Needs Ed25519 migration (`AUD-SEC-03`) |
| **Module M8: Events Management** | **VERIFIED** | Event CRUD, capacity limits, calendar ICS feeds, registration deduplication | None |
| **Module M9: Attendance Terminal** | **PARTIALLY VERIFIED** | QR check-in, TOTP check-in, offline sync queue | Plaintext TOTP secret at rest (`AUD-SEC-04`) |
| **Module M10: Campus Venue Registry** | **VERIFIED** | PostgreSQL `btree_gist` exclusion constraint, live conflict detector | None |
| **Module M11: Certificate Engine** | **VERIFIED** | Pure JS PDF generation, vector layouts, asset/font managers | None |
| **Module M12: Batch Issuance** | **PARTIALLY VERIFIED** | Participant resolution, background batching, retry | Idempotency payload mismatch (`AUD-CERT-02`) |
| **Module M13: Public Verification** | **PARTIALLY VERIFIED** | 80-bit CSPRNG, Crockford Base32, SHA-256 DB binding, QR badge | X-Forwarded-For rate limit bypass (`AUD-SEC-01`), Fallback regeneration (`AUD-CERT-01`) |
| **Phase 4 (M14 - M17)** | **PENDING** | Not started | Strictly held pending audit review & authorization |
| **Phase 5 (Hardening & Handover)** | **PENDING** | Not started | Production hardening & Zod 4 evaluation |
