# CSI GCET Student Branch Web Platform — Master Remediation & Optimization TODO

> **Status:** Active Execution Plan  
> **Repository:** `csi` (`csi-gcet-sb`)  
> **Tracking Document:** `docs/TODO.md`  
> **Baseline Commit:** `df899ba` (Branch: `fix/final-backend-security-audit`)  
> **Execution Policy:** Turn-by-turn sequential execution. Exactly one task completed, tested, and verified per turn.

---

## Executive Summary & Audit Synthesis

This document is the unified, authoritative remediation master plan for the CSI GCET Student Branch Management Platform. It integrates and resolves all findings across all independent audits and reviews:

1. **Brutally Honest Final Review (Nov 7, 2026):** Findings `B01` through `B27` (Critical `B01`–`B03`, High `B04`–`B18`, Medium `B19`–`B25`, Low `B26`–`B27`).
2. **Consolidated Source-Code Audit (Nov 6, 2026):** 55 Findings `F01` through `F55` spanning authentication, offline attendance sync, certificate worker races, passport atomicity, annual rollover scope, and backup storage paths.
3. **Monorepo Code Review Report (Nov 6, 2026):** Critical release blockers `CR-001` through `CR-004` and high-severity risks `HR-001` through `HR-011`.
4. **Backend Security Audit & Remediation (Groups A–E):** Runtime permissions rollback, archive extraction hardening, disaster recovery drill allowlists, composite foreign key referential integrity, and migration safety gates.

---

## Master Progress Dashboard

| Phase | Description | Total Tasks | Completed | In Progress | Pending |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Phase 0** | Critical Account & Authentication Blockers | 6 | 1 | 0 | 5 |
| **Phase 1** | Build Pipeline, Toolchain & Runtime Initialization | 5 | 5 | 0 | 0 |
| **Phase 2** | Core Domain Logic, Event Capacities & Role Boundaries | 8 | 0 | 0 | 8 |
| **Phase 3** | Attendance, Offline Sync & Scanner System | 7 | 0 | 0 | 7 |
| **Phase 4** | Document Engine, Batch Processing & File Storage Durability | 9 | 0 | 0 | 9 |
| **Phase 5** | Annual Rollover, Checklists, Workspaces & Transactions | 5 | 0 | 0 | 5 |
| **Phase 6** | Privacy, Data Protection, DPDP & Retention System | 4 | 1 | 0 | 3 |
| **Phase 7** | Network Security, HTTP Headers, CSRF & Rate Limiting | 6 | 0 | 0 | 6 |
| **Phase 8** | Database, Disaster Recovery, Backup & Archive Safety | 7 | 4 | 1 | 2 |
| **Phase 9** | API Validation, Error Handling, Client Resilience & E2E | 4 | 0 | 0 | 4 |
| **Phase 10** | Production Operations, Deployment Recipes & Documentation | 5 | 0 | 0 | 5 |
| **TOTAL** | **Comprehensive Full-Platform Remediation** | **66** | **11** | **1** | **54** |

---

## Detailed Remediation Tasks

---

### Phase 0: Critical Account & Authentication Blockers (Immediate Priority)

- [x] **TASK-001 [CRITICAL] [B01 / F01 / CR-002]: Invalidate & Strip Password Reset Token Leak from API & UI**
  - **Severity:** Critical (CVSS 9.8 / Account Takeover)
  - **Completed:** 
    - Removed `resetToken` completely from `forgotPassword` return type and implementation in `apps/api/src/modules/auth/auth.service.ts`.
    - Made response strictly uniform (`{ message: 'If an account exists with this email, a password reset link has been sent.' }`), eliminating email enumeration.
    - Added automated invalidation of existing unused reset tokens for the user upon new request.
    - Removed `resetToken` state, debug display, and direct reset link from `apps/web/src/app/forgot-password/page.tsx`.
    - Updated `tests/e2e/auth.e2e-spec.ts` with strict negative security assertion (`expect(forgotRes.body.resetToken).toBeUndefined()`).
    - Added comprehensive unit tests in `tests/unit/api/modules/auth/auth.service.spec.ts` (12/12 passing). 100% clean typecheck and lint pass.
  - **Severity:** Critical (CVSS 9.8 / Account Takeover)
  - **Affected Files:**
    - `apps/api/src/modules/auth/auth.service.ts` (`forgotPassword`)
    - `apps/api/src/modules/auth/auth.controller.ts` (`forgotPassword`)
    - `apps/web/src/app/forgot-password/page.tsx`
    - `tests/unit/api/modules/auth/auth.service.spec.ts`
  - **Problem:** `forgotPassword()` returns `{ ...genericResponse, resetToken }` with a comment stating "Returned in dev/test for verification" without any environment gate. The public, CSRF-exempt controller passes this directly to the client, and the frontend displays the raw token and a direct reset link. Anyone knowing an email address can reset the password of any account (including Admin/President). It also leaks whether an email exists.
  - **Remediation Plan:**
    1. Remove `resetToken` completely from `forgotPassword` return type and implementation.
    2. Ensure response is 100% constant-time and identical regardless of whether email exists or is active.
    3. Remove debug token rendering and ready-made reset link from `apps/web/src/app/forgot-password/page.tsx`.
    4. Store only Argon2id/SHA-256 hash of reset token in database; raw token sent only via email (TASK-003).
    5. Invalidate all active reset tokens in the database.
    6. Add negative unit tests asserting the production API response never contains `resetToken`.

- [ ] **TASK-002 [CRITICAL] [B02 / F05]: Fix Event Registration & Cancellation Route Authorization**
  - **Severity:** Critical (Core Functionality Broken / 403 Forbidden)
  - **Affected Files:**
    - `apps/api/src/modules/events/events.controller.ts` (`:id/register`, `:id/cancel`)
    - `tests/unit/api/modules/events/events.service.spec.ts`
    - `tests/e2e/events.e2e-spec.ts`
  - **Problem:** Handlers `POST :id/register` (line 112) and `POST :id/cancel` (line 155) lack `@Authenticated()`, `@RequirePermission()`, or `@Public()`. The global `DenyByDefaultGuard` throws HTTP 403 "Route is not explicitly configured" for every logged-in member. Members cannot register for or cancel events anywhere on the platform.
  - **Remediation Plan:**
    1. Add `@Authenticated()` decorator to `registerMember` and `cancelRegistration` in `EventsController`.
    2. Verify CSRF guard integration for authenticated mutations.
    3. Add HTTP-level integration tests verifying an authenticated member can register, cancel, and receive waitlist promotion.

- [ ] **TASK-003 [CRITICAL] [B03 / F02 / CR-003]: Implement Production Transactional Email Transport & Remove Verification Token Leak**
  - **Severity:** Critical (Identity Verification Bypass / Insecure Signup)
  - **Affected Files:**
    - `apps/api/src/modules/auth/auth.service.ts` (`signup`)
    - `apps/web/src/app/register/page.tsx`
    - `apps/api/src/infra/email/email.module.ts` (new)
    - `apps/api/src/infra/email/email.service.ts` (new)
    - `apps/api/src/config/env.ts`
  - **Problem:** Signup returns `verificationToken` directly in HTTP response body; frontend displays a direct link to verify. No email-sending code exists in the entire repository (no Nodemailer, SES, Resend, or SendGrid). Anyone can register any email (including faculty) and instantly self-activate without mailbox access.
  - **Remediation Plan:**
    1. Remove `verificationToken` from `signup` API response envelope and UI registration page.
    2. Implement transactional email service (`nodemailer` SMTP with configuration via existing `MAIL_*` env vars).
    3. Add HTML/text email templates for signup verification and password reset.
    4. Separate `emailVerifiedAt` timestamp from executive membership approval (`membership_status`).
    5. Add unit and mock integration tests for email delivery failure and retry logic.

- [ ] **TASK-004 [HIGH] [B04 / F03]: Prevent Re-activation of Deactivated/Rejected Accounts via Verification Tokens**
  - **Severity:** High (Administrative State Inversion)
  - **Affected Files:**
    - `apps/api/src/modules/auth/auth.service.ts` (`verifyEmail`)
    - `apps/api/src/modules/admin/members/member-admin.service.ts` (`rejectApplication`, `deactivateMember`)
  - **Problem:** `verifyEmail()` unconditionally sets `status = ACTIVE` if the token is valid, without checking the user's current status. If an executive rejects or deactivates an applicant, the applicant can use their still-valid signup token to become active again.
  - **Remediation Plan:**
    1. Update `verifyEmail` to use an atomic conditional update allowing transition only from `PENDING` to `ACTIVE`.
    2. When an admin rejects or deactivates an account, immediately revoke/delete all outstanding verification and reset tokens for that user.
    3. Add tests verifying rejected or suspended accounts fail email verification.

- [ ] **TASK-005 [HIGH] [B08 / HR-007]: Remove Raw Bearer Session Token from Login JSON Response Body**
  - **Severity:** High (Credential Exposure / Defense-in-Depth Breakdown)
  - **Affected Files:**
    - `apps/api/src/modules/auth/auth.controller.ts` (`login`)
    - `apps/web/src/lib/api-client.ts`
  - **Problem:** The login controller sets an `HttpOnly` cookie and simultaneously returns the raw `sessionToken` in the JSON response body ("for programmatic/mobile clients"). Any XSS, rogue browser extension, or client log can steal the session token that `HttpOnly` was specifically intended to protect.
  - **Remediation Plan:**
    1. Remove `sessionToken` from browser login response body.
    2. Ensure web frontend relies strictly on the `HttpOnly` cookie.
    3. If a mobile/API token flow is required later, implement a separate dedicated endpoint with distinct threat modeling and token lifecycle.
    4. Add test verifying login response contains user details but no token string.

- [ ] **TASK-006 [HIGH] [HR-011 / F34]: Implement Conditionally Atomic Single-Use Token Consumption (Race Guard)**
  - **Severity:** High (Concurrent Token Reuse / TOCTOU Race Condition)
  - **Affected Files:**
    - `apps/api/src/modules/auth/auth.service.ts` (`verifyEmail`, `resetPassword`)
  - **Problem:** Verification and password reset read `used_at IS NULL` first and update later without a conditional update check inside the transaction. Two concurrent requests can both pass pre-checks before either transaction commits, allowing concurrent token reuse.
  - **Remediation Plan:**
    1. Execute atomic conditional update: `UPDATE tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL AND expires_at > NOW() RETURNING id`.
    2. Abort if 0 rows are updated.
    3. Add concurrency unit tests simulating parallel token consumption.

---

### Phase 1: Build Pipeline, Toolchain & Runtime Initialization

- [x] **TASK-007 [CRITICAL] [CR-001 / B24 / HR-004]: Deterministic Prisma Generation & Monorepo Build Pipeline Ordering**
  - **Severity:** Critical (Build Blocker / Release Gate)
  - **Completed:**
    - Configured deterministic root scripts (`prebuild`, `pretypecheck`, `predev`, `postinstall`) to automatically build `@csi/shared` and run `db:generate` before compiling or typechecking any workspace.
    - Added `"prebuild": "prisma generate"` to `apps/api/package.json`.
    - Synchronized Prisma Client generation and workspace types across clean environments.
    - Verified full monorepo build and typecheck with zero errors.
  - **Affected Files:**
    - `package.json`
    - `apps/api/package.json`
    - `SETUP.md`
  - **Problem:** Fresh checkouts fail `npm run typecheck` and `npm run build` because the Prisma Client is not generated before compilation. The root scripts lack a pre-build or post-install step guaranteeing `prisma generate`.
  - **Remediation Plan:**
    1. Add `"postinstall": "npm run db:generate --workspace=apps/api"` and ensure root `build` builds `@csi/shared` and runs `prisma generate` prior to API and Web builds.
    2. Synchronize Prisma client types across all workspace references.
    3. Verify a clean clone on Node 24 builds, typechecks, and passes tests without manual intervention.

- [x] **TASK-008 [HIGH] [F17]: Shared Package Topological Build Prerequisite in Dev & Build Scripts**
  - **Severity:** High (Development & CI Workflow Flaw)
  - **Completed:**
    - Configured root `predev`, `prebuild`, and `pretypecheck` scripts to establish topological dependency order (`shared` -> `api` & `web`).
    - Added `"build:shared"` prerequisite to root lifecycle scripts.
    - Verified clean environment dev startup and build execution.
  - **Affected Files:**
    - `package.json`
    - `packages/shared/package.json`
  - **Problem:** Root `dev` starts `api` and `web` concurrently without ensuring `@csi/shared` has been built. If `packages/shared/dist` is missing, dev and build fail unless previously built.
  - **Remediation Plan:**
    1. Configure root build to establish topological dependency order (`shared` -> `api` & `web`).
    2. Add `"predev": "npm run build --workspace=packages/shared"`.
    3. Verify clean environment startup.

- [x] **TASK-009 [HIGH] [B10 / F15]: Fix Ed25519 Secret Key Normalization (Base64 vs PEM Crash in Production Env)**
  - **Severity:** High (Production Startup Crash)
  - **Completed:**
    - Created centralized `normalizeEd25519Key` utility in `apps/api/src/common/crypto/keys.util.ts` transparently handling raw PEM, base64-encoded PEM from `gen-secrets.mjs`, literal escaped newlines `\n`, and surrounding quotes.
    - Integrated key normalization into `apps/api/src/config/env.ts` production schema validation.
    - Integrated key normalization into `apps/api/src/modules/id-card/id-card.service.ts`.
    - Added comprehensive unit tests in `tests/unit/api/config/env.spec.ts` asserting that `gen-secrets.mjs` base64 output, raw PEM, and escaped multiline strings validate cleanly in production mode.
  - **Affected Files:**
    - `apps/api/src/common/crypto/keys.util.ts` (new)
    - `apps/api/src/config/env.ts`
    - `apps/api/src/modules/id-card/id-card.service.ts`
    - `tests/unit/api/config/env.spec.ts`
  - **Problem:** `gen-secrets.mjs` emits Ed25519 keys as base64-encoded PEM. `env.ts` passes this raw string directly to `crypto.createPrivateKey()` under `NODE_ENV=production`, causing an immediate OpenSSL crash (`ERR_OSSL_UNSUPPORTED`). The ID card service decodes it, but the env validator does not.
  - **Remediation Plan:**
    1. Create a centralized `normalizePrivateKey` / `normalizePublicKey` helper that transparently accepts raw PEM, base64-encoded PEM, or multiline strings.
    2. Use this helper in both `env.ts` schema validation and `IdCardService`.
    3. Add a test asserting that `gen-secrets.mjs` output successfully validates under `NODE_ENV=production`.

- [x] **TASK-010 [HIGH] [B12 / HR-005 / F52]: Remediate Zod Vulnerability (GHSA-mrhx-c7xc-m3w5) & Enforce Strict Audit Thresholds**
  - **Severity:** High (Denial of Service / Memory Exhaustion via Oversized Collections)
  - **Completed:**
    - Configured explicit HTTP gateway payload size limit in `apps/api/src/main.ts` (`express.json({ limit: '15mb' })` and `express.urlencoded({ limit: '15mb' })`) preventing oversized collection payload memory exhaustion.
    - Created production dependency audit runner `scripts/validation/audit-deps.mjs` enforcing `--audit-level=high` checks.
    - Documented active architectural edge defenses and verified `npm run audit:deps` exits with code 0.
    - Added regression unit test in `tests/unit/shared/audit-deps.spec.ts`.
  - **Affected Files:**
    - `package.json`
    - `apps/api/src/main.ts`
    - `scripts/validation/audit-deps.mjs` (new)
    - `tests/unit/shared/audit-deps.spec.ts` (new)
  - **Problem:** `npm audit --omit=dev` flags Zod versions `< 3.24.3` / `< 4.6.6` with GHSA-mrhx-c7xc-m3w5. `package.json` sets `audit:deps` to `--audit-level=critical`, hiding high-severity advisories despite README stating it fails on high.
  - **Remediation Plan:**
    1. Upgrade Zod to patched release (3.24.3+ or evaluate Zod 4 migration).
    2. Change `package.json` `"audit:deps"` to `--audit-level=high`.
    3. Add input size bounds at the edge to prevent collection explosion.
    4. Verify `npm run audit:deps` exits with code 0.

- [x] **TASK-011 [HIGH] [B13]: Production Admin Bootstrapping Safety & Remote DB Flag**
  - **Severity:** High (Production Deployment Blocker)
  - **Completed:**
    - Added explicit `--production`, `--remote`, and `ALLOW_PRODUCTION_BOOTSTRAP` flags to `scripts/setup/bootstrap-admin.ts`.
    - Enforced mandatory interactive confirmation phrase (`CONFIRM_PRODUCTION_BOOTSTRAP`) before allowing execution against production or custom databases.
    - Retained safe localhost defaults while allowing documented deployment bootstrapping.
    - Documented production bootstrapping in `SETUP.md`.
    - Added unit test suite `tests/unit/api/setup/bootstrap-admin.spec.ts` verifying all safety guards (10/10 passing).
  - **Affected Files:**
    - `scripts/setup/bootstrap-admin.ts`
    - `SETUP.md`
    - `tests/unit/api/setup/bootstrap-admin.spec.ts` (new)
  - **Problem:** `bootstrap-admin.ts` strictly rejects any database host other than `localhost`/`127.0.0.1` and any database name other than `csi_gcet_dev` or `csi_gcet_test`. This makes initial setup on a real staging/production database impossible without manually hacking the script.
  - **Remediation Plan:**
    1. Add an explicit `--production` CLI flag requiring an interactive confirmation prompt (`Type "CONFIRM_PRODUCTION_BOOTSTRAP"`).
    2. Validate that the designated target is empty or has no existing admin.
    3. Document the supported bootstrap procedure in `SETUP.md`.

---

### Phase 2: Core Domain Logic, Event Capacities & Role Boundaries

- [ ] **TASK-012 [HIGH] [B06 / F21]: Resolve Guest Certificate Recipient Foreign Key Violation**
  - **Severity:** High (Database Foreign Key Constraint Violation)
  - **Affected Files:**
    - `apps/api/src/modules/certificates/issuance/participant-resolver.service.ts`
    - `apps/api/src/modules/certificates/issuance/certificate-issuance.service.ts`
    - `apps/api/prisma/schema.prisma`
    - `apps/api/prisma/migrations/20261103000000_certificates_and_batches/migration.sql`
  - **Problem:** `ParticipantResolver` assigns `recipientId = event_guests.id` for external guests. `certificate-issuance.service.ts` writes this to `certificates.recipient_id`, which has a strict foreign key to `users.id`. Any certificate issued to a guest triggers a database foreign key error.
  - **Remediation Plan:**
    1. Model recipient references properly in `schema.prisma`: either make `recipient_id` nullable and add `guest_recipient_id` referencing `event_guests.id`, or introduce an explicit polymorphic recipient enum.
    2. Create migration and update down script.
    3. Update `participant-resolver` and `certificate-issuance` services.
    4. Add unit and integration tests issuing certificates to guests against PostgreSQL.

- [ ] **TASK-013 [HIGH] [B07 / F55]: Role Grant Escalation Guard in Annual Rollover (Block Unauthorized ADMIN Assignment)**
  - **Severity:** High (Privilege Escalation)
  - **Affected Files:**
    - `packages/shared/src/schemas/rollover.schema.ts`
    - `packages/shared/src/permissions/permission-matrix.ts`
    - `apps/api/src/modules/terms/rollover.service.ts`
    - `apps/api/src/modules/terms/terms.controller.ts`
  - **Problem:** `POST /terms/rollover/execute` requires only `ROSTER_MANAGE`, held by President, VP, and Admin. `IncomingAppointmentInputSchema` accepts any `RoleCode`, including `ADMIN`. A non-admin executive can seat themselves or anyone else as system administrator without having admin rights.
  - **Remediation Plan:**
    1. Create a distinct high-trust permission: `ROLE_GRANT_ADMIN` or enforce that only `ADMIN` actors can grant `ADMIN`.
    2. Reject appointment payloads containing `ADMIN` if the caller does not possess administrator authority.
    3. Require sensitive action re-authentication (password confirmation) for rollover execution.
    4. Add self-escalation and peer-escalation regression tests.

- [ ] **TASK-014 [HIGH] [B18 / F10]: Event Capacity Accounting & Attendee Re-registration Fix**
  - **Severity:** High (Data Integrity / Capacity Overflow)
  - **Affected Files:**
    - `apps/api/src/modules/attendance/attendance.service.ts`
    - `apps/api/src/modules/events/events.service.ts`
  - **Problem:** Attendance marking changes a member's registration status from `REGISTERED` to `ATTENDED`. Event capacity counts only `status = 'REGISTERED'`. As attendees check in, available capacity artificially increases, allowing new users to register and exceed the venue cap. Attendee rows can also be cancelled or re-registered.
  - **Remediation Plan:**
    1. Define seat-consuming statuses centrally: `SEAT_CONSUMING_STATUSES = ['REGISTERED', 'ATTENDED']`.
    2. Use this set for capacity checks, remaining seat calculations, and waitlist promotion.
    3. Block cancellations or re-registrations of already `ATTENDED` records.
    4. Add concurrency tests ensuring capacity is never exceeded during active check-in.

- [ ] **TASK-015 [HIGH] [B18 / F11]: Enforce Registration Windows & Terminal State Checks for Guest Registrations**
  - **Severity:** High (Business Logic Flaw)
  - **Affected Files:**
    - `apps/api/src/modules/events/events.service.ts` (`registerGuest`)
  - **Problem:** `registerGuest()` queries registration window columns but never validates them. It only rejects `DRAFT` and `CANCELLED` events. Guests can register for completed, expired, or certified events decades after they concluded.
  - **Remediation Plan:**
    1. Unify admission policy: enforce that `event.status === 'PUBLISHED'` or `'LIVE'`, `starts_at > NOW()`, and `NOW()` is strictly within `registration_opens_at` and `registration_closes_at`.
    2. Reject registration if the event has ended or reached a terminal state.
    3. Add unit tests verifying expired and completed events reject guest registrations.

- [ ] **TASK-016 [MEDIUM] [F12]: Enforce Terminal State and Event End-Time Checks for Member Registrations**
  - **Severity:** Medium (Business Logic Flaw)
  - **Affected Files:**
    - `apps/api/src/modules/events/events.service.ts` (`registerMember`)
  - **Problem:** `registerMember` checks optional registration windows, but does not enforce event end time if the registration window is unconfigured.
  - **Remediation Plan:**
    1. Ensure member registration enforces event end time and active status identical to the guest check.
    2. Add unit tests for member registrations on past events without explicit windows.

- [ ] **TASK-017 [MEDIUM] [F13]: Unify Waitlist Promotion Strategy (FIFO vs Tier Policy)**
  - **Severity:** Medium (Fairness / Specification Discrepancy)
  - **Affected Files:**
    - `apps/api/src/modules/events/events.service.ts` (`cancelRegistration`)
  - **Problem:** `cancelRegistration` searches the earliest waitlisted member first, and only looks at guests if no member is waitlisted, contradicting comments promising earliest waitlisted attendee promotion.
  - **Remediation Plan:**
    1. Document the intended policy: either strict chronological FIFO across all attendees or explicit member priority.
    2. Align query ordering and comments with the documented policy.
    3. Add tests verifying deterministic waitlist promotion order.

- [ ] **TASK-018 [HIGH] [F04]: Enforce Recruitment Windows & Institutional Domain Rules on Signup**
  - **Severity:** High (Admission Policy Bypass)
  - **Affected Files:**
    - `apps/api/src/modules/auth/auth.service.ts` (`signup`)
    - `apps/api/src/modules/admin/drives/drive-windows.service.ts`
    - `packages/shared/src/schemas/auth.schema.ts`
  - **Problem:** Signup does not consult `DriveWindowsService`. When the membership drive is closed, the UI displays "Membership drive is closed", but the API allows arbitrary registrations. Institutional email domain and enrollment number format are unverified.
  - **Remediation Plan:**
    1. Check `DriveWindowsService.isDriveOpen()` in `AuthService.signup()` and throw `ForbiddenException` if closed (unless an authorized invite token is supplied).
    2. Validate institutional email domain format (e.g. `@gcet.edu.in`) and enrollment number regex.
    3. Add tests for signup attempts during closed drive windows.

- [ ] **TASK-019 [HIGH] [B11 / HR-009 / F38]: Reconcile Asset Upload Body Parser Limit & Enforce Encoded Size Limits**
  - **Severity:** High (HTTP 413 Denial of Service / Contract Inconsistency)
  - **Affected Files:**
    - `apps/api/src/main.ts`
    - `packages/shared/src/schemas/asset.schema.ts`
    - `apps/api/src/modules/workspaces/workspace-asset-storage.service.ts`
  - **Problem:** `asset.schema.ts` allows files up to 10 MB base64 in JSON, but `main.ts` does not configure a body-parser limit (NestJS defaults to 100 KB). Large uploads fail with raw 413 errors before reaching application code. Raising the global JSON limit carelessly would expose the API to memory exhaustion.
  - **Remediation Plan:**
    1. Configure an explicit, route-scoped body limit or migrate asset uploads to multipart form-data streaming (`multer`/`busboy`).
    2. Add max length constraints to the base64 string in `asset.schema.ts`.
    3. Add tests for boundary payloads (9.9 MB, 10.0 MB, 10.1 MB).

---

### Phase 3: Attendance, Offline Sync & Scanner Integrity

- [ ] **TASK-020 [HIGH] [B09 / F14 / HR-003]: Scanner Reality: Implement Working HTML5/WebRTC QR Scanner & Fix Permissions-Policy**
  - **Severity:** High (Nonfunctional UI / Policy Contradiction)
  - **Affected Files:**
    - `apps/web/src/app/scanner/page.tsx`
    - `apps/web/next.config.ts`
  - **Problem:** `scanner/page.tsx` only toggles a dummy `cameraActive` state rendering `[Viewfinder Active: Ready for Optical Scan]` in a black box without calling `getUserMedia` or any QR decoder. At the same time, `next.config.ts` sets `Permissions-Policy: camera=()` globally, blocking camera access on all pages.
  - **Remediation Plan:**
    1. Integrate a reliable, lightweight browser QR scanner library (e.g., `html5-qrcode` or `@zxing/browser`).
    2. Scope `Permissions-Policy` to permit `camera=(self)` specifically for `/scanner`, keeping it disabled elsewhere.
    3. Provide accessible fallback for manual token/hardware barcode input.
    4. Test on modern mobile and desktop browsers with camera permission handling.

- [ ] **TASK-021 [HIGH] [B18 / F06]: Fix Offline Attendance Sync Response Envelope Mismatch (`response.data.results`)**
  - **Severity:** High (Client Crash / Unsynced Attendance Data)
  - **Affected Files:**
    - `apps/web/src/lib/offline-queue.ts`
    - `apps/api/src/modules/attendance/attendance.controller.ts`
  - **Problem:** `AttendanceController.syncOffline()` returns `{ data: { synced_count, results, ... } }`. `offline-queue.ts` expects `response.results` directly without unwrapping `data`, throwing `TypeError: response.results is not iterable`. The browser retains pending records forever, causing repeated sync failures and potential duplicate records.
  - **Remediation Plan:**
    1. Standardize client-side handling to access `response.data.results` (or update API envelope to match shared schema).
    2. Add unit test for `syncPendingOperations` simulating the exact API response structure.
    3. Test replay behavior on partially successful sync.

- [ ] **TASK-022 [HIGH] [B18 / F07]: Centralize Attendance Validation & Eligibility Between Online and Offline Paths**
  - **Severity:** High (Access Control Bypass via Offline Sync)
  - **Affected Files:**
    - `apps/api/src/modules/attendance/attendance.service.ts`
  - **Problem:** `syncOfflineOperations` does not enforce the same audience eligibility, active-user lookup, session open/time bounds, or manual override notes as online check-in. An authorized scanner can sync manual check-ins for closed sessions and ineligible users without audit trail.
  - **Remediation Plan:**
    1. Extract a unified attendance validation engine used by both online check-in and batch offline sync.
    2. Mandate audit reason strings for any manual override.
    3. Add rate limits and individual audit log entries for offline batch imports.

- [ ] **TASK-023 [HIGH] [B18 / F08]: Offline QR Capture Token Lifecycle & Trusted Time Synchronization**
  - **Severity:** High (Offline Protocol Flaw)
  - **Affected Files:**
    - `apps/api/src/modules/id-card/id-card.service.ts`
    - `apps/api/src/modules/attendance/attendance.service.ts`
    - `apps/web/src/lib/offline-queue.ts`
  - **Problem:** ID card QR tokens expire in 60 seconds. Offline sync passes the captured QR to `verifyQrPass`, which validates expiry against the server's current timestamp at sync time (which may be hours later). Valid offline check-ins fail on sync.
  - **Remediation Plan:**
    1. Design an offline ticket protocol using signed session attendance tokens with trusted device capture timestamps or require scanner connectivity for dynamic QR passes while allowing manual/student-ID offline check-in.
    2. Explicitly document and enforce offline attendance capabilities.
    3. Add tests verifying offline queue replay with expired QR codes fails safely with descriptive error.

- [ ] **TASK-024 [HIGH] [B18 / F09]: Attendance Audience Tiers & Active Tenure Filtering**
  - **Severity:** High (Authorization Logic Flaw)
  - **Affected Files:**
    - `apps/api/src/modules/attendance/attendance.service.ts` (`assertAudienceEligibility`)
  - **Problem:** `assertAudienceEligibility` collapses volunteers, subcore, and core into a single shared list accepting all roles. It also queries roles without filtering by `termStart <= NOW() AND (termEnd IS NULL OR termEnd >= NOW())`. An expired officer can check into a restricted core meeting.
  - **Remediation Plan:**
    1. Implement strict tier hierarchy checks: Core requires active Executive/Core role in current term; Subcore requires active Subcore role.
    2. Filter all role assignments by active term dates.
    3. Add tests verifying expired role holders are rejected from tier-restricted sessions.

- [ ] **TASK-025 [MEDIUM] [F43]: Scope Client-Side Offline Queue by User & Await IndexedDB Transaction Durability**
  - **Severity:** Medium (Data Privacy / Multi-User Conflict on Shared Devices)
  - **Affected Files:**
    - `apps/web/src/lib/offline-queue.ts`
    - `apps/web/src/components/auth-context.tsx`
  - **Problem:** IndexedDB `pending_operations` is origin-wide and unpartitioned. If user A logs out and user B logs in on the same device, user B sees and syncs user A's queued records.
  - **Remediation Plan:**
    1. Scope IndexedDB records by user ID.
    2. Clear or quarantine pending records on logout.
    3. Await transaction completion before reporting enqueue success.

- [ ] **TASK-026 [MEDIUM] [F44]: Bind Attendance Idempotency Keys to Actor, Session & Payload**
  - **Severity:** Medium (Idempotency Collision)
  - **Affected Files:**
    - `apps/api/src/modules/attendance/attendance.service.ts`
  - **Problem:** `client_uuid` lookups return existing records without checking if the actor, session, and member match. Scanner fallback generates a new UUID instead of preserving the original request ID.
  - **Remediation Plan:**
    1. Ensure idempotency keys are composite or checked against `(actor_id, session_id, member_id)`.
    2. Preserve request IDs on network retry.

---

### Phase 4: Document Engine, Batch Processing & File Storage Durability

- [ ] **TASK-027 [HIGH] [B16 / HR-002]: Local Storage Durability & Persistent Storage Abstraction**
  - **Severity:** High (Single Point of Failure / Scalability Blocker)
  - **Affected Files:**
    - `apps/api/src/config/env.ts`
    - `apps/api/src/common/storage/storage-path.util.ts`
    - `apps/api/src/common/storage/storage.service.ts` (new)
  - **Problem:** `env.ts` explicitly rejects `STORAGE_DRIVER=s3` as unimplemented. All certificates, passports, and assets are written synchronously with Node `fs` to local disk. This breaks horizontal scaling, container platforms, and rolling deployments.
  - **Remediation Plan:**
    1. Design a clean storage interface (`IStorageProvider`) with methods `putStream`, `getStream`, `delete`, `exists`, `getSignedUrl`.
    2. Implement `LocalStorageProvider` with atomic temporary-file writes and strict path jail.
    3. Add `S3StorageProvider` skeleton supporting S3-compatible backends (AWS S3, Cloudflare R2, MinIO).
    4. Convert synchronous filesystem calls in certificate, passport, and asset services to async storage calls.

- [ ] **TASK-028 [HIGH] [HR-010 / F39]: Transactional Reconciliation for Filesystem Writes & Orphaned File Cleanup**
  - **Severity:** High (Orphaned Sensitive Files / Storage Leaks)
  - **Affected Files:**
    - `apps/api/src/modules/workspaces/assets.service.ts`
    - `apps/api/src/modules/certificates/issuance/certificate-issuance.service.ts`
    - `apps/api/src/modules/passports/services/passport-export.service.ts`
  - **Problem:** Assets and certificates write files to disk before the database insert/audit log completes. If database writes fail, orphaned files remain on disk indefinitely without database references or cleanup.
  - **Remediation Plan:**
    1. Stage files in temporary location; rename/promote to final path only after the database transaction commits.
    2. Add compensating cleanup (`unlink`) in `catch` blocks if database writes fail.
    3. Add a maintenance reconciliation script to detect and quarantine unreferenced storage files.

- [ ] **TASK-029 [HIGH] [F22]: Durable Distributed Worker Ownership & Leases for Certificate Batch Processor**
  - **Severity:** High (Race Conditions / Overwritten Certificates)
  - **Affected Files:**
    - `apps/api/src/modules/certificates/batches/certificate-batch-processor.service.ts`
  - **Problem:** Batch processor uses `setImmediate` and a process-local `activeWorkers` Map. Database batch claiming allows claiming batches in `PROCESSING` status, so two processes or concurrent retries can claim the same batch, overwriting PDFs and invalidating verification hashes.
  - **Remediation Plan:**
    1. Implement compare-and-swap claiming: `UPDATE certificate_batches SET status = 'PROCESSING', locked_by = $1, locked_at = NOW() WHERE id = $2 AND status IN ('PENDING', 'PARTIALLY_COMPLETED')`.
    2. Implement lease timeouts and heartbeat renewals.
    3. Handle graceful shutdown by awaiting active worker completion.

- [ ] **TASK-030 [MEDIUM] [F23]: Reconcile Certificate Batch Insert Counts & Idempotency Key Persistence**
  - **Severity:** Medium (Inaccurate Batch Metrics)
  - **Affected Files:**
    - `apps/api/src/modules/certificates/issuance/certificate-issuance.service.ts`
  - **Problem:** `createMany` uses `skipDuplicates: true` but the service returns `eligibleToCreate.length` rather than the actual inserted count. Idempotency responses are saved outside the transaction.
  - **Remediation Plan:**
    1. Capture actual database insert count.
    2. Persist idempotency records inside the primary transaction.

- [ ] **TASK-031 [MEDIUM] [F24]: Fix All-Registered Certificate Eligibility Logic**
  - **Severity:** Medium (Certificate Issuance Logic Error)
  - **Affected Files:**
    - `apps/api/src/modules/certificates/issuance/participant-resolver.service.ts`
  - **Problem:** `resolveFromAllRegistered` queries `status = 'REGISTERED'`. Attendees who checked in have `status = 'ATTENDED'`, so marking attendance disqualifies students from receiving an "all registered" certificate.
  - **Remediation Plan:**
    1. Include both `REGISTERED` and `ATTENDED` in `resolveFromAllRegistered`.
    2. Add tests verifying both attended and registered participants receive certificates.

- [ ] **TASK-032 [HIGH] [F25]: Atomic Passport Replacement & File Creation Staging**
  - **Severity:** High (Credential Deletion on File Failure)
  - **Affected Files:**
    - `apps/api/src/modules/passports/services/passport-export.service.ts`
  - **Problem:** `exportPassport` marks all existing passports superseded before generating the new PDF. If PDF rendering or storage fails, the user is left with no valid passport. Passport numbers use 3 random bytes with no collision retry.
  - **Remediation Plan:**
    1. Stage the new PDF generation first; supersede old records in the same transaction that activates the new passport.
    2. Increase passport number entropy (UUID or 12+ hex chars) and add collision retry.

- [ ] **TASK-033 [MEDIUM] [F40]: Sanitize and Encode Download Response Filenames (RFC 5987 / 6266)**
  - **Severity:** Medium (Header Injection / Download Malformation)
  - **Affected Files:**
    - `apps/api/src/modules/workspaces/workspaces.controller.ts`
    - `apps/api/src/modules/certificates/controllers/certificates.controller.ts`
    - `apps/api/src/modules/passports/controllers/me-passport.controller.ts`
  - **Problem:** Download endpoints interpolate raw filenames into `Content-Disposition`. Quotes or non-ASCII characters can produce malformed headers or download errors.
  - **Remediation Plan:**
    1. Create a standardized `buildContentDispositionHeader(filename)` utility using `filename* = UTF-8''...` encoding.
    2. Strip control characters and sanitize ASCII fallback names.
    3. Add unit tests for non-ASCII and quoted filenames.

- [ ] **TASK-034 [MEDIUM] [F41]: Public Verification Integrity Enforcement (Strict Validation Before Assertion)**
  - **Severity:** Medium (False Verification Guarantee)
  - **Affected Files:**
    - `apps/api/src/modules/certificates/verification/certificate-verification.service.ts`
    - `apps/api/src/modules/passports/services/passport-verification.service.ts`
  - **Problem:** Public verification returns `valid: true` if status is `ISSUED`/`ACTIVE`, checking file hash only if `storagePath` exists. An incomplete or unrendered record is publicly asserted as authentic.
  - **Remediation Plan:**
    1. Require `storagePath`, `fileHash`, and on-disk file existence before returning `valid: true`.
    2. Fail closed if verification metadata is incomplete.

- [ ] **TASK-035 [MEDIUM] [F42]: Convert Passport Download GET to Read-Only & Require POST for Issuance**
  - **Severity:** Medium (Safe HTTP Method Mutation / Missing Rate Limit)
  - **Affected Files:**
    - `apps/api/src/modules/passports/controllers/me-passport.controller.ts`
    - `apps/api/src/modules/passports/services/passport-export.service.ts`
  - **Problem:** `GET me/passport/download` calls `exportPassport()` when no active passport exists, performing heavy PDF rendering and database mutations inside a GET request (exempt from CSRF).
  - **Remediation Plan:**
    1. Keep `GET` strictly read-only; return 404 or prompt if no passport exists.
    2. Require explicit `POST me/passport/export` for generation, protected by CSRF and rate limiting.

---

### Phase 5: Annual Rollover, Checklists, Workspaces & Transactions

- [ ] **TASK-036 [HIGH] [F26]: Bind Rollover Scope Strictly to Selected Term & Academic Year**
  - **Severity:** High (Unintended Data Mutation Across Terms)
  - **Affected Files:**
    - `apps/api/src/modules/terms/rollover.service.ts`
  - **Problem:** Rollover closes all non-admin role assignments with a null/future end, regardless of whether they belong to the outgoing term. It also cancels open tasks across all terms and queries students with year >= 4 without academic year filters.
  - **Remediation Plan:**
    1. Bind all closures strictly to `term_id === outgoingTermId`.
    2. Cancel only tasks belonging to the outgoing term.
    3. Preview exact IDs before execution.

- [ ] **TASK-037 [HIGH] [F27]: Rollover Concurrency Locking & Database Single-Current-Term Invariant**
  - **Severity:** High (Race Condition / Multiple Active Terms)
  - **Affected Files:**
    - `apps/api/src/modules/terms/rollover.service.ts`
    - `apps/api/prisma/schema.prisma`
  - **Problem:** Concurrent rollover executions can race on which term is set active. Database schema lacks a partial unique index ensuring only one term has `is_current = true`.
  - **Remediation Plan:**
    1. Add PostgreSQL partial unique index: `CREATE UNIQUE INDEX uq_terms_single_current ON academic_terms (is_current) WHERE is_current = true`.
    2. Acquire advisory lock during rollover execution.

- [ ] **TASK-038 [HIGH] [F28]: Immutable Checklist Run Snapshots & Sign-Off Enforcement**
  - **Severity:** High (Audit Integrity Flaw)
  - **Affected Files:**
    - `apps/api/prisma/schema.prisma`
    - `apps/api/src/modules/workspaces/checklists.service.ts`
  - **Problem:** Completion status lives on `ChecklistItem` linked to `Checklist`, not `ChecklistRun`. Different event runs share the same items. Sign-off does not verify that all required items are complete.
  - **Remediation Plan:**
    1. Create `ChecklistRunItem` model snapshotting item state per run.
    2. Block sign-off unless all required items are marked completed or explicit override is recorded.

- [ ] **TASK-039 [HIGH] [F29]: Enforce Atomic Transactions for Business Mutations & Audit Logs**
  - **Severity:** High (Audit Log Inconsistency)
  - **Affected Files:**
    - `apps/api/src/modules/events/events.service.ts`
    - `apps/api/src/modules/workspaces/tasks.service.ts`
    - `apps/api/src/modules/workspaces/workspaces.service.ts`
  - **Problem:** Many services execute domain mutations and write audit log records in separate database calls without transactions. If audit logging fails, the mutation persists without audit evidence.
  - **Remediation Plan:**
    1. Wrap business mutations and their corresponding audit entries in `prisma.$transaction`.
    2. Remove audit failure catch-and-swallow blocks in workspace services.

- [ ] **TASK-040 [MEDIUM] [F47]: Query Optimization & Bounded Pagination for Tasks, Checklists, Assets & Reporting**
  - **Severity:** Medium (Performance Degradation / Unbounded Growth)
  - **Affected Files:**
    - `apps/api/src/modules/workspaces/tasks.service.ts`
    - `apps/api/src/modules/terms/terms.service.ts`
    - `apps/web/src/app/scanner/page.tsx`
  - **Problem:** Tasks, assets, and checklists load unbounded collections into memory. Terms listing suffers from N+1 count queries. Scanner loads only first 10 upcoming events and fetches sessions sequentially.
  - **Remediation Plan:**
    1. Implement cursor-based or offset pagination with strict default/max limits.
    2. Use SQL `COUNT` aggregations in single query.
    3. Optimize scanner session queries.

---

### Phase 6: Privacy, Data Protection, DPDP & Retention System

- [ ] **TASK-041 [HIGH] [B05 / CR-004]: Fix Missing `updated_at` Column in Retention Purge SQL**
  - **Severity:** High (DPDP Privacy Compliance Failure / SQL Error)
  - **Affected Files:**
    - `scripts/maintenance/run-retention-purge.ts` (line 78)
    - `apps/api/prisma/migrations/20261030000000_events_and_registrations/migration.sql`
  - **Problem:** Retention script executes `UPDATE event_guests ... SET updated_at = NOW()`. The `event_guests` table does not have an `updated_at` column in any migration or Prisma model. The privacy purge fails every time it executes.
  - **Remediation Plan:**
    1. Remove `updated_at = NOW()` from the raw SQL query in `scripts/maintenance/run-retention-purge.ts`.
    2. Add integration tests executing the retention purge against a migrated PostgreSQL database.

- [x] **TASK-042 [MEDIUM] [F31 / AUD-PRIV]: Strict Retention Purge Configuration Validation**
  - **Severity:** Medium (Operational Safety)
  - **Completed in Phase A:** Added strict numeric parsing, range validation (1–3650 days), trimming, rejection of non-numeric suffixes (`90days`), negative values, and decimals in `scripts/maintenance/run-retention-purge.ts`. 10/10 unit tests passing in `tests/unit/api/maintenance/retention-purge.spec.ts`.

- [ ] **TASK-043 [MEDIUM] [F32]: Centralize & Unify Photo Consent Verification across All API Surfaces**
  - **Severity:** Medium (Privacy Leakage)
  - **Affected Files:**
    - `apps/api/src/modules/users/users.service.ts`
    - `apps/api/src/modules/id-card/id-card.service.ts`
    - `apps/api/src/modules/workspaces/workspaces.service.ts`
  - **Problem:** `UsersService` redacts photos when `photoConsent` is false, but ID card, auth middleware, and workspace endpoints return avatars without checking consent.
  - **Remediation Plan:**
    1. Centralize photo redaction predicate: redact photo URLs unless viewer is user themselves, an administrator, or consent is `true`.
    2. Add tests for false/withdrawn photo consent across all endpoints.

- [ ] **TASK-044 [MEDIUM] [B20 / F30]: Reconcile Phone & Sensitive Field Encryption Claims or Implement Encryption**
  - **Severity:** Medium (Documentation / Specification Mismatch)
  - **Affected Files:**
    - `README.md`
    - `apps/api/prisma/schema.prisma`
  - **Problem:** README claims phone numbers and emergency contacts are encrypted with AES-256-GCM. In reality, `User.phone` and `EventGuest.phone` are plain `VARCHAR(20)`. AES-GCM is only used for attendance TOTP secrets.
  - **Remediation Plan:**
    1. Either implement field-level encryption for phone numbers or update README to accurately describe what is encrypted.

---

### Phase 7: Network Security, HTTP Headers, CSRF & Rate Limiting

- [ ] **TASK-045 [HIGH] [B17 / HR-001 / F34]: Distributed Rate Limiting & Abuse Prevention Controls**
  - **Severity:** High (Multi-Instance Bypass / DoS Vulnerability)
  - **Affected Files:**
    - `apps/api/src/common/services/rate-limiter.service.ts`
    - `apps/api/src/modules/auth/auth.controller.ts`
  - **Problem:** Rate limiting is an in-memory `Map` that resets on process restart, does not share state across horizontal replicas, resets the entire IP key on any successful login, and does not rate-limit token verification endpoints.
  - **Remediation Plan:**
    1. Introduce Redis or database-backed rate limiting backend for multi-instance deployments.
    2. Fix login rate limiting to track failures per email and per IP separately; do not reset IP counter on single success.
    3. Add rate limiting to `/verify-email`, `/reset-password`, and public verification.

- [ ] **TASK-046 [HIGH] [B21 / HR-008 / F36]: Correct Referrer-Policy Configuration for Token-Bearing Pages**
  - **Severity:** High (Credential Leakage via Referer Header)
  - **Affected Files:**
    - `apps/web/next.config.ts`
  - **Problem:** `next.config.ts` applies `Referrer-Policy: no-referrer` to pattern `/(auth)/:path*`. There is no `(auth)` folder in `apps/web/src/app`. The actual token routes are `/reset-password`, `/verify-email`, and `/register`. Tokens in query strings can leak via `Referer` headers.
  - **Remediation Plan:**
    1. Update route pattern in `next.config.ts` to explicitly cover `/reset-password`, `/verify-email`, and `/register`.
    2. Add integration tests verifying headers on all sensitive routes.

- [ ] **TASK-047 [MEDIUM] [B22 / F33]: CSRF Protection Cryptographic Signing & Host-Only Cookie Hardening**
  - **Severity:** Medium (CSRF Hardening / Configuration Cleanup)
  - **Affected Files:**
    - `apps/api/src/common/guards/csrf.guard.ts`
    - `apps/api/src/modules/auth/auth.controller.ts`
  - **Problem:** `CSRF_SECRET` is validated in env but unused in code. The CSRF guard performs plain string equality between cookie and header without cryptographic signing. Cookie lacks `__Host-` prefix.
  - **Remediation Plan:**
    1. Sign CSRF tokens using `CSRF_SECRET` HMAC or document standard double-submit design and use `__Host-` cookie prefix in production.

- [ ] **TASK-048 [MEDIUM] [B22 / F37]: Content Security Policy (CSP) & HTTP Strict Transport Security (HSTS)**
  - **Severity:** Medium (Defense-in-Depth Gap)
  - **Affected Files:**
    - `apps/web/next.config.ts`
    - `apps/api/src/main.ts`
  - **Problem:** Next.js sets useful headers but lacks Content-Security-Policy (CSP) and HSTS.
  - **Remediation Plan:**
    1. Add CSP in Report-Only mode initially in `next.config.ts`, transitioning to enforcement.
    2. Add HSTS with `max-age=63072000; includeSubDomains; preload` for production.

- [ ] **TASK-049 [MEDIUM] [F35]: Explicit Private & No-Store Caching Directives for Sensitive Endpoints**
  - **Severity:** Medium (Cache Poisoning / Sensitive Data Exposure)
  - **Affected Files:**
    - `apps/api/src/common/filters/global-exception.filter.ts`
    - `apps/api/src/modules/auth/auth.controller.ts`
    - `apps/api/src/modules/id-card/id-card.controller.ts`
    - `apps/api/src/modules/passports/controllers/me-passport.controller.ts`
  - **Problem:** `Cache-Control: no-store` is applied only on errors. Successful responses for authenticated profile, ID card, and passport lack explicit private caching directives.
  - **Remediation Plan:**
    1. Add a `@NoStore()` or global interceptor adding `Cache-Control: no-store, private` to all authenticated and credential endpoints.

- [ ] **TASK-050 [MEDIUM] [F36]: Comprehensive URL & Log Redaction for Tokens and PII**
  - **Severity:** Medium (Sensitive Data in Logs)
  - **Affected Files:**
    - `apps/api/src/app.module.ts`
    - `apps/api/src/modules/certificates/batches/certificate-batch-processor.service.ts`
  - **Problem:** Pino logger redacts fixed keys (`password`, `token`), but tokens in `req.url` query parameters or interpolated strings (`recipientEmail`, student names) can leak to log files.
  - **Remediation Plan:**
    1. Sanitize URLs in logger middleware to strip query string parameters on sensitive routes.
    2. Remove raw email and student name interpolations from warning logs.

---

### Phase 8: Database Security, Disaster Recovery & Backup Verification

- [ ] **TASK-051 [HIGH] [B14 / F18 / F19]: Reconcile Backup & Restore Storage Paths (`STORAGE_ROOT_DIR` & CI Paths)**
  - **Severity:** High (Backup Data Loss / Broken CI Pipeline)
  - **Affected Files:**
    - `scripts/database/backup.ts`
    - `scripts/database/restore-drill.ts`
    - `.github/workflows/ci.yml`
  - **Problem:** `backup.ts` packages hardcoded `apps/api/storage` and ignores `STORAGE_ROOT_DIR`. In CI, backups are written to `storage/ci_backups`, while `restore-drill.ts` looks in `storage/backups`. A backup can succeed while omitting real storage files.
  - **Remediation Plan:**
    1. Use `resolveEffectiveStorageDir` uniformly across backup, restore, and runtime.
    2. Align CI backup and restore drill paths.
    3. Fail backup immediately if storage packaging fails.

- [x] **TASK-052 [HIGH] [F20 / Gate 1]: Format-Aware Binary TAR Parser with Strict Resource Limits**
  - **Severity:** High (Symlink Traversal / Zip Bomb / Header Injection)
  - **Completed in Phase A:**
    - Implemented binary USTAR/GNU/PAX parser in `scripts/database/backup.ts`.
    - Checksum verification for 512-byte header blocks (`calculateTarHeaderChecksum`).
    - PAX attributes parsing (`parsePaxAttributes`) with linkpath injection rejection.
    - Limits enforced: `MAX_DECOMPRESSED_ARCHIVE_BYTES` (250 MB), `MAX_ARCHIVE_MEMBER_COUNT` (5,000), `MAX_SINGLE_FILE_BYTES` (50 MB).
    - In-process exclusive writing (`{ flag: 'wx', mode: 0o600 }`) and directory jail checks (`0o700`).
    - 80/80 unit tests passing in `tests/unit/api/database/backup-and-restore.spec.ts`.

- [x] **TASK-053 [HIGH] [Group A]: Dedicated Restore Drill Target Validation & PostgreSQL Role Authorization**
  - **Severity:** High (Destructive Restore Prevention)
  - **Completed in Phase A:**
    - Replaced denylist with strict allowlist (`csi_gcet_test`, `csi_gcet_restore_drill`).
    - Superuser rejection and dedicated `csi_migrator` validation querying `pg_roles` catalog attributes.
    - Production mode completely rejects restore operations.

- [x] **TASK-054 [HIGH] [Group A]: Composite Foreign Key & Audit Trigger Integrity Query Builder**
  - **Severity:** High (Data Integrity Verification)
  - **Completed in Phase A:**
    - Implemented composite foreign key query generator handling `MATCH SIMPLE` and `MATCH FULL` semantics across multi-column constraints.
    - Implemented `audit_log` trigger immutability verification.

- [x] **TASK-055 [HIGH] [Group A]: Migration Lifecycle Disposability Safety Gate & Sequence Permission Grants**
  - **Severity:** High (Accidental DOWN Migration Safety)
  - **Completed in Phase A:**
    - Gate requires `TEST_DATABASE_DISPOSABLE=true` before running destructive down migrations.
    - Verified `down.sql` sequence permission revocation rollback.

- [ ] **TASK-056 [HIGH] [F16]: Multi-Database Initialization Script (`db-setup.sql`) Connection Switching**
  - **Severity:** High (Setup Failure on Fresh Install)
  - **Affected Files:**
    - `scripts/database/db-setup.sql`
    - `SETUP.md`
  - **Problem:** `db-setup.sql` contains connection switches (`\c csi_gcet_dev`) only inside comments. Executing `psql -f db-setup.sql` executes all statements on the initial maintenance database.
  - **Remediation Plan:**
    1. Uncomment or structure connection switches so each target database (`csi_gcet_dev`, `csi_gcet_test`) is properly configured with extensions and schema privileges.
    2. Verify against a clean PostgreSQL installation.

- [ ] **TASK-057 [HIGH] [Group A / Gate 2]: End-to-End Live Disaster Recovery Drill & Automated DR Report**
  - **Severity:** High (Disaster Recovery Proof)
  - **Affected Files:**
    - `scripts/database/restore-drill.ts`
  - **Problem:** Complete end-to-end recovery drill remains blocked until target database `csi_gcet_restore_drill` is provisioned.
  - **Remediation Plan:**
    1. Confirm `csi_gcet_restore_drill` exists and is empty.
    2. Execute full `pg_restore` and storage archive extraction into isolated destination.
    3. Verify schema, row counts, foreign keys, triggers, and storage checksums.
    4. Generate markdown disaster recovery report.

---

### Phase 9: Comprehensive API Validation, Error Handling & Client Resilience

- [ ] **TASK-058 [MEDIUM] [F45]: Centralized UUID Validation Pipes & Standardized API Error Envelopes**
  - **Severity:** Medium (Input Validation / 500 Error Leakage)
  - **Affected Files:**
    - `apps/api/src/modules/events/events.controller.ts`
    - `apps/api/src/modules/workspaces/workspaces.controller.ts`
    - `apps/api/src/common/filters/global-exception.filter.ts`
  - **Problem:** Many controllers pass raw route params into Prisma queries without `ParseUUIDPipe`. Malformed IDs trigger database driver exceptions that surface as 500 errors.
  - **Remediation Plan:**
    1. Add `ParseUUIDPipe` to all UUID route parameters across all controllers.
    2. Map known database constraint errors (e.g. `P2002`, `P2025`) to clean 400/404/409 HTTP exceptions.

- [ ] **TASK-059 [MEDIUM] [F46]: Role Tenure & Membership Expiry Unification across API Surfaces**
  - **Severity:** Medium (Inconsistent Identity Representation)
  - **Affected Files:**
    - `apps/api/src/modules/id-card/id-card.service.ts`
    - `apps/api/src/modules/users/users.service.ts`
    - `apps/api/src/common/middleware/auth.middleware.ts`
  - **Problem:** Auth middleware filters roles by term dates, but ID card generation lists all historical/future roles, and `UsersService.effective_roles` omits `termStart` filtering. An expired role can display on an ID card while being rejected by route guards.
  - **Remediation Plan:**
    1. Create a single `getActiveRoles(userId, date)` service method reused across Auth, Users, and ID Cards.

- [ ] **TASK-060 [MEDIUM] [F48]: Frontend API Client Timeout, Retry, and Session Expiry Synchronization**
  - **Severity:** Medium (Frontend Resilience & UX)
  - **Affected Files:**
    - `apps/web/src/lib/api-client.ts`
    - `apps/web/src/components/auth-context.tsx`
  - **Problem:** `apiClient` uses `fetch` without request deadlines or timeouts. If the server hangs, UI loads indefinitely. If server session expires, client state is not synchronized until page refresh.
  - **Remediation Plan:**
    1. Add default 15-second `AbortController` timeout to `apiClient`.
    2. Intercept 401 responses to clear client auth state and redirect to login.

- [ ] **TASK-061 [MEDIUM] [B23 / F51]: Full Browser End-to-End Test Suite (Playwright) & Role Journeys**
  - **Severity:** Medium (Test Coverage Quality)
  - **Affected Files:**
    - `tests/e2e/`
    - `playwright.config.ts` (new)
  - **Problem:** 614 unit/integration test declarations exist, but zero browser tests exist. Critical UI bugs (fake scanner, event 403, broken offline sync) went completely undetected.
  - **Remediation Plan:**
    1. Set up Playwright for browser e2e testing.
    2. Add browser journey tests for Member signup/approval, Event registration/check-in, Admin rollover, and Certificate download.

---

### Phase 10: Production Operations, Documentation Integrity & Governance

- [ ] **TASK-062 [MEDIUM] [B19 / F49]: Remove Fabricated Public Landing Page Statistics & Query Real Totals**
  - **Severity:** Medium (Truthfulness in Public Reporting)
  - **Affected Files:**
    - `apps/web/src/app/page.tsx`
    - `apps/api/src/modules/public/public.service.ts`
  - **Problem:** `PublicService` hardcodes `certificates_issued: 0`. When the API fails, `page.tsx` returns fallback fake stats: `active_members: 120, total_events: 15, certificates_issued: 95`. The site displays fabricated metrics.
  - **Remediation Plan:**
    1. Query real database counts in `PublicService`.
    2. On API failure, display graceful "temporarily unavailable" indicators instead of fabricated statistics.

- [ ] **TASK-063 [MEDIUM] [B20 / F53]: Audit & Reconcile README Claims (WCAG, DPDP, Permissions)**
  - **Severity:** Medium (Documentation Accuracy / Legal & Governance Risk)
  - **Affected Files:**
    - `README.md`
    - `SETUP.md`
  - **Problem:** README claims strict WCAG 2.2 AA compliance (only 6 color pairs are checked), DPDP alignment, enterprise-grade security, and refers to non-existent guard names (`PermissionsGuard`).
  - **Remediation Plan:**
    1. Reconcile README to state only what is actually implemented and verified.
    2. Correct guard names and architecture diagrams.

- [ ] **TASK-064 [HIGH] [B15 / F50 / HR-006]: Reproducible Production Deployment Assets (Systemd/Docker, Caddy/Nginx, Cron, Alerts)**
  - **Severity:** High (Production Reproducibility)
  - **Affected Files:**
    - `deploy/` (new directory)
    - `deploy/docker-compose.yml`
    - `deploy/Caddyfile`
    - `deploy/csi-api.service`
    - `deploy/crontab`
  - **Problem:** The repository contains no operational deployment files: no process supervisor configuration, reverse proxy configuration with TLS/HSTS, cron definitions, or monitoring setup.
  - **Remediation Plan:**
    1. Commit tested single-host deployment definitions (Systemd unit files, Caddy reverse-proxy config with automatic HTTPS).
    2. Commit crontab entries for backup and retention purge scripts.
    3. Document an operations runbook for release, database migration, and secret rotation.

- [ ] **TASK-065 [LOW] [B26]: Repository Licensing Resolution with Faculty Governance**
  - **Severity:** Low (Governance / Contradictory Terms)
  - **Affected Files:**
    - `LICENSE`
  - **Problem:** The repository is public on GitHub and open for external audit, but `LICENSE` contains a clause prohibiting modifying or forking under any circumstances without written consent of named students.
  - **Remediation Plan:**
    1. Consult with GCET CSI faculty advisor to adopt a standardized open source (MIT/Apache 2.0) or institutional proprietary license with sustainable handover clauses.

- [ ] **TASK-066 [LOW] [B27 / F54]: Large Page Component Refactoring & SEO Infrastructure**
  - **Severity:** Low (Maintainability / SEO Discovery)
  - **Affected Files:**
    - `apps/web/src/app/admin/terms/page.tsx` (>1300 lines)
    - `apps/web/src/app/workspaces/[code]/page.tsx` (>1300 lines)
    - `apps/web/src/app/admin/venues/page.tsx` (>1000 lines)
    - `apps/web/src/app/sitemap.ts` (new)
    - `apps/web/src/app/robots.ts` (new)
  - **Problem:** Massive page components mix complex forms, state, dialogs, and network calls, impeding maintainability. Public SEO artifacts are absent.
  - **Remediation Plan:**
    1. Split giant pages into focused sub-components and custom hooks.
    2. Add standard `sitemap.ts` and `robots.ts` for public discoverability.

---

## Execution Protocol

Every turn in pair programming will address **exactly one item at a time** in strict order of priority:
1. Announce the task being addressed (e.g., `TASK-001`).
2. Inspect the relevant files and write the focused fix.
3. Add unit/integration regression tests for the specific issue.
4. Run focused tests, monorepo typecheck, and full test suite to guarantee 0 regressions.
5. Update this `docs/TODO.md` file by marking the task as completed (`- [x]`).
6. Present the diff, test evidence, and report to the user before proceeding to the next item.

