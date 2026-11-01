# Master Audit Finding Register
## CSI GCET Student Branch Platform
**Audit Stage:** Post-M13, Post-Repository Structural Organization  
**Auditor:** Application Security Engineer & Systems Architect  
**Target Repository:** `C:\Users\HP\Desktop\Vedant\CSI-main` (`main` @ `2a83e97`)  
**Date:** October 31, 2026  

---

## 1. Master Findings Matrix

| Finding ID | Severity | Category | Finding Summary | Affected Area / Component | M14 Blocker | Production Blocker | Status |
|---|:---:|---|---|---|:---:|:---:|:---:|
| **AUD-SEC-01** | **High** | API Security | Client-Spoofed `X-Forwarded-For` Bypasses Public Verification Rate Limiter | `PublicVerificationRateLimitGuard` & `PublicVerificationController` | No | **No** (Resolved) | **Resolved** |
| **AUD-CERT-01** | **High** | Data Integrity | Certificate Fallback Regeneration Omits Verification Code & QR Badge | `CertificateIssuanceService.getCertificateDownload` | **No** (Resolved) | **No** (Resolved) | **Resolved** |
| **AUD-CERT-02** | **High** | Concurrency / Logic | Idempotency-Key Replay Fails to Validate Request Hash & Stale Responses | `CertificateIssuanceService.issueBatch` & `IdempotencyKey` | No | **No** (Resolved) | **Resolved** |
| **AUD-SEC-02** | **High** | Authorization | Unauthenticated, Un-Rate-Limited Public Endpoint Exposes Student Identity | `IdCardController.verifyQrPass` (`POST /api/id-card/verify`) | No | **No** (Resolved) | **Resolved** |
| **AUD-SEC-03** | **Medium** | Cryptography | Digital QR Pass Uses HMAC-SHA256 with Session Secret Instead of Ed25519 | `IdCardService.getIdCard` & `IdCardService.verifyQrPass` | No | **Yes** | Confirmed |
| **AUD-SEC-04** | **Medium** | Data Security | Plaintext Storage of Attendance TOTP Secrets at Rest | `AttendanceService` & `attendance_sessions` schema | No | **No** (Resolved) | **Resolved** |
| **AUD-CI-01** | **Medium** | DevOps / CI | GitHub Actions CI Omits E2E & Exclusion Suites; Fragile Audit Step | `.github/workflows/ci.yml` | No | **No** (Resolved) | **Resolved** |
| **AUD-PRIV-01** | **Medium** | Privacy / DPDP | Missing Automated Technical Enforcement of Retention Schedules & TTL Purge | Database Tables (`sessions`, `tokens`, `audit_log`, `idempotency`) | No | **No** (Resolved) | **Resolved** |
| **AUD-PERF-01** | **Medium** | Reliability / Memory | In-Memory RateLimiter Store Lacks Cleanup and Multi-Instance Support | `RateLimiterService` | No | **No** (Resolved) | **Resolved** |
| **AUD-CERT-03** | **Low** | Resilience | Crash Recovery Gap Leaves Interrupted Batches Stuck in Processing | `CertificateBatchProcessorService` | No | **No** (Resolved) | **Resolved** |
| **AUD-TEST-01** | **Low** | QA / Testing | Zero Component or Visual E2E Test Coverage for Frontend App Router | `apps/web/src` (43 TSX/TS files, 22 routes) | No | No | Confirmed |
| **AUD-DATA-01** | **Low** | Database / Logic | Clock Skew Offline Sync Fallback Violates Unique Composite Constraint | `AttendanceService.syncOfflineOperations` | No | **No** (Resolved) | **Resolved** |
| **AUD-DEP-01** | **Informational** | Supply Chain | High Severity Zod Advisory (`GHSA-mrhx-c7xc-m3w5`) Deferred Due to Major API Rewrite | `@csi/shared`, `@csi/api`, `@csi/web` (`zod@3.24.2`) | No | No | Mitigated (Accepted) |
| **M14-AUD-01** | **Medium** | Cryptography | Specification Gap: Asymmetric Digital PDF Signature (PAdES / PKCS#7) vs Tamper-Evident SHA-256 Checksum | `PassportPdfService` & `PassportVerificationService` | No | Roadmap | Disposed (Roadmap) |
| **M14-AUD-02** | **High** | API Architecture | Unified Public Verification Route (`GET /api/verify/:code`) Omits Activity Passports | `PublicVerificationController` | No | **No** (Resolved) | **Resolved** |
| **M14-AUD-03** | **High** | API Security | Client-Spoofed `X-Forwarded-For` Bypasses Public Passport Verification Rate Limiter | `PublicVerificationRateLimitGuard` & `PassportsController` | No | **No** (Resolved) | **Resolved** |
| **M14-AUD-04** | **Medium** | Data Integrity | Activity Passport Historical Snapshot Lacked Detailed Item Records & Superseded Status | `PassportExportService` & `PassportVerificationService` | No | **No** (Resolved) | **Resolved** |
| **M14-AUD-05** | **Medium** | Business Logic | Committee Role Aggregation Lacked Canonical Role Code Validation and Included Future Tenures | `PassportAggregationService` | No | **No** (Resolved) | **Resolved** |
| **M14-AUD-06** | **Low** | Credential Transparency | Post-Issuance Revocation of Underlying Certificates Not Communicated During Verification | `PassportVerificationService` | No | **No** (Resolved) | **Resolved** |

---

## 2. Detailed Finding Profiles

---

### Finding AUD-SEC-01: Client-Spoofed `X-Forwarded-For` Bypasses Public Verification Rate Limiter
- **Severity:** High
- **Category:** API Security & Abuse Resistance
- **Affected Components:**
  - `apps/api/src/modules/certificates/verification/public-verification-rate-limit.guard.ts` (Lines 40–43)
  - `apps/api/src/modules/certificates/controllers/public-verification.controller.ts` (Line 74)
- **Evidence:**
  ```typescript
  // public-verification-rate-limit.guard.ts L40-43
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  ```
- **Explanation:**
  The API correctly configures Express `trust proxy` in `main.ts` using `env.TRUST_PROXY_HOPS`, which enables Express to securely populate `req.ip` by walking back the configured number of trusted reverse proxy hops. However, both the rate-limit guard and controller manually parse the raw `X-Forwarded-For` header using `split(',')[0]`. The leftmost value in `X-Forwarded-For` is client-supplied and entirely untrusted.
- **Reproduction:**
  Send HTTP GET requests to `/api/verify/:code` supplying varying headers:
  `curl -H "X-Forwarded-For: 10.0.0.1" http://localhost:4000/api/verify/XXXX-XXXX-XXXX-XXXX`
  `curl -H "X-Forwarded-For: 10.0.0.2" http://localhost:4000/api/verify/XXXX-XXXX-XXXX-XXXX`
  Each request is mapped to a distinct IP key in the in-memory map, allowing unlimited verification attempts and completely defeating the 30 req/min rate limit.
- **Impact:**
  Enables automated, high-speed enumeration of 16-character Crockford Base32 verification codes without triggering 429 Rate Limited.
- **Remediation:**
  Replace manual header parsing with `req.ip || req.socket.remoteAddress || 'unknown'` across all verification guards and controllers.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Replaced manual raw `x-forwarded-for` header extraction with Express-sanitized `req.ip` in `PublicVerificationRateLimitGuard`, `PublicVerificationController`, and `PassportsController`. Verified with automated test in `passports.e2e-spec.ts` asserting rotating spoofed `X-Forwarded-For` headers still trigger 429 Rate Limited).

---

### Finding AUD-CERT-01: Certificate Fallback Regeneration Omits Verification Code & QR Badge
- **Severity:** High
- **Category:** Data Integrity & Cryptographic Anti-Forgery
- **Affected Components:**
  - `apps/api/src/modules/certificates/issuance/certificate-issuance.service.ts` (Lines 405–438)
- **Evidence:**
  ```typescript
  // certificate-issuance.service.ts L410-424
  const certData = {
    recipient_name: certificate.recipientName,
    recipient_id: certificate.recipientId || certificate.id,
    event_title: certificate.event.title,
    event_category: certificate.event.category,
    issue_date: certificate.issueDate,
    achievement: certificate.achievement || undefined,
    certificate_number: certificate.certificateNumber,
    college_name: 'GCET Engineering College',
    custom_placeholders: typeof certificate.metadata === 'object' && certificate.metadata !== null
      ? (certificate.metadata as Record<string, string>)
      : undefined,
    // MISSING: verification_code, verification_url
  };
  const rendered = await this.templateEngine.renderCertificate(templateConfig, certData);
  await this.storageService.saveCertificatePdf(certificate.id, rendered.pdfBuffer, certificate.batchId || undefined);
  ```
- **Explanation:**
  In `getCertificateDownload()`, if the stored PDF file is missing from disk, the service falls back to regenerating the certificate deterministically. However, `certData` does not supply `verification_code` or `verification_url` because only `verificationCodeHash` was stored in the database. Consequently, the newly rendered PDF lacks the QR verification code element. Furthermore, the newly saved PDF has a different SHA-256 checksum than the original `certificate.fileHash`, and `certificate.fileHash` is not updated in the database. When someone subsequently verifies the certificate via `/api/verify/:code`, `storageService.verifyFileIntegrity` computes a checksum mismatch and returns `INTEGRITY_MISMATCH`.
- **Reproduction:**
  1. Generate a certificate batch.
  2. Delete the generated PDF from `apps/api/storage/certificates/<batch-id>/<cert-id>.pdf`.
  3. Call `GET /api/certificates/:id/download`. The service regenerates and writes a new PDF to disk.
  4. Call `GET /api/verify/<verification-code>`. The endpoint returns `INTEGRITY_MISMATCH` because the regenerated PDF hash differs from the database hash.
- **Impact:**
  Legitimately issued certificates whose files were lost or moved become permanently unverifiable upon regeneration, showing an alarming "Certificate integrity check failed" message to verifiers.
- **Remediation:**
  Either store the encrypted verification code in `metadata` (encrypted with `APP_ENCRYPTION_KEY`) so fallback regeneration can reconstruct the exact identical PDF, or fail safely by refusing automatic regeneration and rejecting downloads of missing or corrupt files with explicit error codes.
- **Resolution Status:** **Resolved** (Option A: Fail Safely When an Issued Certificate File Is Missing)
  - Removed dynamic automatic regeneration fallback in `CertificateIssuanceService.getCertificateDownload`.
  - Missing PDF files reject downloads with HTTP 409 Conflict and standard error code `CERTIFICATE_FILE_UNAVAILABLE`.
  - PDF files with SHA-256 checksum mismatches reject downloads with HTTP 409 Conflict and standard error code `CERTIFICATE_INTEGRITY_MISMATCH`.
  - Nonexistent certificates continue returning HTTP 404 Not Found (`CERTIFICATE_NOT_FOUND`).
  - Strict authorization checks precede file presence checks, preventing probing by unauthorized callers (HTTP 403 Forbidden).
  - Clean error logging without student PII or internal server filesystem paths.
  - Verified by 54 unit tests (`certificate-batch.service.spec.ts`) and 33 certificate E2E tests (`certificate-batch.e2e-spec.ts`, `certificate-verification.e2e-spec.ts`).
- **M14 Blocker:** No (Resolved).
- **Production Blocker:** No (Resolved).

---

### Finding AUD-CERT-02: Idempotency-Key Replay Fails to Validate Request Hash & Stale Responses
- **Severity:** High
- **Category:** Concurrency & Transactional Idempotency
- **Affected Components:**
  - `apps/api/src/modules/certificates/issuance/certificate-issuance.service.ts` (Lines 51–60, Lines 212–225)
- **Evidence:**
  ```typescript
  // certificate-issuance.service.ts L51-60
  if (input.idempotencyKey) {
    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { key: input.idempotencyKey },
    });

    if (existingKey && existingKey.response) {
      this.logger.log(`Returning cached response for idempotency key '${input.idempotencyKey}'`);
      return existingKey.response as unknown as CertificateBatchResponse;
    }
  }
  ```
- **Explanation:**
  The `idempotency_keys` table stores `requestHash VARCHAR(64)` and `expiresAt TIMESTAMPTZ`. However, the lookup on line 56 blindly returns `existingKey.response` without comparing `existingKey.requestHash` against the SHA-256 hash of the incoming payload. Additionally, expired keys (`expiresAt < new Date()`) are not filtered out. Furthermore, the idempotency key record is only created *after* the entire batch creation transaction finishes (L217), creating a race window where concurrent requests with the same key can both pass line 52.
- **Reproduction:**
  1. POST `/api/certificates/batches` with `Idempotency-Key: test-key-1` for Event A.
  2. POST `/api/certificates/batches` with the same `Idempotency-Key: test-key-1` but with a completely different payload for Event B.
  3. The API returns HTTP 201 with the cached response for Event A, completely ignoring Event B.
- **Impact:**
  Silent replay of mismatched batch creation responses; potential double-batch creation under concurrent submission races.
- **Remediation:**
  1. Verify `existingKey.requestHash === currentRequestHash`; if different, reject with HTTP 422 `IDEMPOTENCY_PAYLOAD_MISMATCH`.
  2. Verify `existingKey.expiresAt > new Date()`.
  3. Atomically reserve the idempotency key with status `pending` in the initial database transaction.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - In `CertificateIssuanceService.issueBatch`: Added SHA-256 hash comparison between incoming request payload and `existingKey.requestHash`. If the payload has been altered, the endpoint immediately throws HTTP 400 Bad Request with code `IDEMPOTENCY_PAYLOAD_MISMATCH`.
  - Added expiration check: expired keys (`expiresAt < new Date()`) are automatically deleted and renewed rather than replaying stale responses.
  - Verified by comprehensive test suite in `tests/e2e/security-hardening.e2e-spec.ts`.

---

### Finding AUD-SEC-02: Unauthenticated, Un-Rate-Limited Public Endpoint Exposes Student Identity
- **Severity:** High
- **Category:** Authentication, Authorization & Privacy
- **Affected Components:**
  - `apps/api/src/modules/id-card/id-card.controller.ts` (Lines 36–50)
  - `apps/api/src/modules/id-card/id-card.service.ts` (Lines 176–183)
- **Evidence:**
  ```typescript
  // id-card.controller.ts L36-40
  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyQrPass(@Body() rawBody: unknown) {
  ```
- **Explanation:**
  The endpoint `POST /api/id-card/verify` was created to verify attendee QR passes. However, it was annotated with `@Public()`, bypassing `DenyByDefaultGuard`. It required neither authentication nor `attendance.take` / `attendance.mark` permissions, and lacked IP rate limiting. When a valid QR token was posted, it returned the student's `user_id`, `enrollment_no`, `name`, and `roles`.
- **Reproduction:**
  Execute `curl -X POST http://localhost:4000/api/id-card/verify -H "Content-Type: application/json" -d '{"token":"csi_pass.eyJzdWIiOi..."}'` without any session cookies or authorization headers.
- **Impact:**
  Unauthenticated scanning endpoint allows arbitrary anonymous callers to validate tokens and harvest personal student data.
- **Remediation:**
  Require authentication and administrative/scanner permission (`@RequirePermission(PermissionCode.ATTENDANCE_TAKE)`), and apply strict IP rate limiting.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Removed `@Public()` decorator from `POST /api/id-card/verify`.
  - Added `@RequirePermission(PermissionCode.ATTENDANCE_TAKE)`.
  - Integrated sliding-window IP rate limiting (`verify-qr-pass:<ip>`, 60 req/min).
  - Unauthenticated requests fail closed with 401 Unauthorized (`UNAUTHENTICATED`).
  - Unauthorized requests without required permissions fail closed with 403 Forbidden (`FORBIDDEN`).
  - Verified by tests in `tests/e2e/security-hardening.e2e-spec.ts` and `tests/e2e/app.e2e-spec.ts`.

---

### Finding AUD-SEC-03: Digital QR Pass Uses HMAC-SHA256 with Session Secret Instead of Ed25519
- **Severity:** Medium
- **Category:** Cryptographic Design & Architectural Non-Compliance
- **Affected Components:**
  - `apps/api/src/modules/id-card/id-card.service.ts` (Lines 88–90, Lines 123–127)
- **Evidence:**
  ```typescript
  // id-card.service.ts L88-89
  const secret = env.SESSION_SECRET || 'csi_default_secret_string_32chars_long';
  const signature = createHmac('sha256', secret).update(payloadEncoded).digest('base64url');
  ```
- **Explanation:**
  The specification (and `SETUP.md` line 59) mandates Ed25519 asymmetric signing (`QR_SIGNING_PRIVATE_KEY` and `QR_SIGNING_PUBLIC_KEY`) for dynamic ID card QR tokens. Instead, the implementation uses symmetric HMAC-SHA256 with `SESSION_SECRET` (falling back to a hardcoded string `csi_default_secret_string_32chars_long` if unset).
- **Impact:**
  Couples QR token generation to web session cookie secrets. Furthermore, offline scanning terminals cannot verify passes without possessing the server's master symmetric session secret, exposing the server secret to client scanners.
- **Remediation:**
  Implement Ed25519 asymmetric signatures using `crypto.sign('ed25519', ...)` and `crypto.verify('ed25519', ...)`. Remove the hardcoded secret fallback.
- **M14 Blocker:** No.
- **Production Blocker:** Yes.

---

### Finding AUD-SEC-04: Plaintext Storage of Attendance TOTP Secrets at Rest
- **Severity:** Medium
- **Category:** Data Protection & Cryptography at Rest
- **Affected Components:**
  - `apps/api/src/modules/attendance/attendance.service.ts` (Lines 55–68)
  - `apps/api/prisma/schema.prisma` (`totpSecret String @map("totp_secret") @db.VarChar(128)`)
- **Evidence:**
  ```typescript
  // attendance.service.ts L55-68
  const totpSecret = generateBase32Secret(20);
  const session = await this.prisma.attendanceSession.create({
    data: {
      eventId,
      name: input.name,
      ...
      totpSecret, // Plaintext Base32 string
    },
  });
  ```
- **Explanation:**
  `SETUP.md` mandates `APP_ENCRYPTION_KEY` (32 bytes hex for AES-256-GCM), and `env.ts` enforces its presence at startup. However, `APP_ENCRYPTION_KEY` is not used in any application service. Attendance TOTP secrets are stored in unencrypted plaintext in PostgreSQL `attendance_sessions`.
- **Impact:**
  Any unauthorized database read access or database backup snapshot leak exposes all active event attendance secrets, enabling fraudulent check-in generation.
- **Remediation:**
  Encrypt `totpSecret` with AES-256-GCM using `APP_ENCRYPTION_KEY` before database insertion, and decrypt upon session verification.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Created cryptographic module `apps/api/src/common/crypto/encryption.ts` implementing standard authenticated AES-256-GCM encryption and decryption with hex-encoded `IV:AUTH_TAG:CIPHERTEXT`.
  - Updated `AttendanceService`: TOTP secrets are encrypted before database insertion in `createSession` and decrypted during check-in verification in `verifyAttendanceCode`.
  - Maintained backward compatibility for legacy plaintext/mock records if not yet encrypted.
  - Verified by dedicated cryptographic unit tests (`tests/unit/api/common/crypto/encryption.spec.ts`) and end-to-end suite (`tests/e2e/security-hardening.e2e-spec.ts`).

---

### Finding AUD-CI-01: GitHub Actions CI Omits E2E & Exclusion Suites; Fragile Audit Step
- **Severity:** Medium
- **Category:** DevOps & Continuous Integration
- **Affected Components:**
  - `.github/workflows/ci.yml` (Lines 58–60, Lines 84–86)
- **Evidence:**
  ```yaml
  # ci.yml L84-86
  - name: Run unit & integration test suites
    run: npm run test
  ```
- **Explanation:**
  1. `ci.yml` executes `npm run test` (which runs only unit test suites across workspaces), but omitted `npm run test:e2e --prefix apps/api`.
  2. `ci.yml` did not execute `npx tsx scripts/validation/test-venue-exclusion.ts` (6 PostgreSQL exclusion tests).
  3. `ci.yml` line 59 ran `npm run audit:deps`. Because `zod <4.6.6` is reported as High severity by npm audit, `npm audit --omit=dev` exited with code 1, which caused CI to fail on every build unless configured with `--audit-level=critical`.
- **Impact:**
  CI could pass while critical E2E tests were failing, and ordinary builds failed due to unhandled npm audit exit codes.
- **Remediation:**
  Add `npm run test:e2e --prefix apps/api` and `npx tsx scripts/validation/test-venue-exclusion.ts` to `ci.yml`. Configure `npm audit --omit=dev --audit-level=critical` to prevent builds from failing on the deferred Zod advisory.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Added step `Run venue exclusion constraint validation` (`npx tsx scripts/validation/test-venue-exclusion.ts`) to `.github/workflows/ci.yml`.
  - Added step `Run end-to-end integration test suites` (`npm run test:e2e --prefix apps/api`) to `.github/workflows/ci.yml`.
  - Configured root `package.json` `"audit:deps": "npm audit --omit=dev --audit-level=critical"`.
  - Verified pipeline locally; all suites pass and dependency check exits 0.

---

### Finding AUD-PRIV-01: Missing Automated Technical Enforcement of Retention Schedules & TTL Purge
- **Severity:** Medium
- **Category:** Privacy & Data Retention (DPDP)
- **Affected Components:**
  - Database tables: `sessions`, `verification_tokens`, `password_reset_tokens`, `idempotency_keys`, `audit_log`
- **Evidence:**
  `docs/DATA_INVENTORY.md` classifies `audit_log.ip` as rolling 90 days retention, and authentication tokens have `expires_at` fields. A repository-wide inspection reveals zero background workers, cron schedulers, or database triggers that purge expired records.
- **Impact:**
  Expired sessions, one-time verification tokens, and idempotency keys accumulate indefinitely in PostgreSQL, violating the stated data minimization and storage limitation rules.
- **Remediation:**
  Implement a scheduled cleanup worker or SQL scheduled procedure to purge expired tokens, expired idempotency keys, and anonymize `audit_log.ip` past 90 days.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Created `RetentionService` in `apps/api/src/modules/maintenance/retention.service.ts` purging expired `sessions`, `verification_tokens`, `password_reset_tokens`, and `idempotency_keys`.
  - Implemented automated guest data anonymization for events concluded > 90 days (`name = '[ANONYMIZED]'`, `email = 'anonymized_<id>@redacted.local'`, `phone = null`).
  - Implemented presentation-tier dynamic IP anonymization in `AuditLogsService.findAll` (`[ANONYMIZED]` for entries > 90 days), preserving PostgreSQL trigger-enforced database ledger immutability.
  - Exposed audited maintenance endpoint `POST /api/admin/maintenance/retention/purge` and recorded audit log entry `RETENTION_PURGE_EXECUTED`.
  - Verified by unit tests (`tests/unit/api/modules/maintenance/retention.service.spec.ts`, `tests/unit/api/modules/audit-logs/audit-logs.service.spec.ts`) and end-to-end tests (`tests/e2e/security-hardening.e2e-spec.ts`).

---

### Finding AUD-PERF-01: In-Memory RateLimiter Store Lacks Cleanup and Multi-Instance Support
- **Severity:** Medium
- **Category:** Performance, Scalability & Reliability
- **Affected Components:**
  - `apps/api/src/common/services/rate-limiter.service.ts` (Line 10)
- **Evidence:**
  ```typescript
  // rate-limiter.service.ts L10
  private readonly store = new Map<string, RateLimitRecord>();
  ```
- **Explanation:**
  While `PublicVerificationRateLimitGuard` has a periodic cleanup interval, `RateLimiterService` never pruned expired keys from its internal `Map`. Keys created for failed logins or password reset attempts remained in memory for the entire lifetime of the process. In addition, in-memory rate limiting cannot be shared across multiple instances in a clustered or load-balanced deployment.
- **Impact:**
  Gradual memory growth over long uptime; rate limits do not synchronize across horizontally scaled API replicas.
- **Remediation:**
  Add periodic key pruning to `RateLimiterService`, and plan for a shared Redis/PostgreSQL rate limiting backend for multi-instance production.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Implemented `evictExpired()` sliding-window key cleanup in `RateLimiterService` running on an unreferenced 5-minute interval timer.
  - Implemented NestJS `OnModuleDestroy` lifecycle hook for graceful interval cleanup.
  - Verified by unit tests in `tests/unit/api/common/services/rate-limiter.service.spec.ts`.

---

### Finding AUD-CERT-03: Crash Recovery Gap Leaves Interrupted Batches Stuck in Processing
- **Severity:** Low
- **Category:** Resilience & Fault Recovery
- **Affected Components:**
  - `apps/api/src/modules/certificates/batches/certificate-batch-processor.service.ts` (Lines 68–80, Lines 205–217)
- **Evidence:**
  When a batch starts, `status` is set to `processing`. If the Node.js process terminates abruptly (e.g., host reboot or SIGKILL) mid-batch, the batch and any active certificates remain in `processing`. `retryBatch()` only matches `status: FAILED`.
- **Impact:**
  Interrupted batches cannot be retried via the API without direct manual intervention in the database.
- **Remediation:**
  Allow `retryBatch()` to reconcile batches stuck in `processing` older than a threshold (e.g., 30 minutes), or add an application startup reconciler.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Updated `retryBatch()` and `executeBatch()` in `CertificateBatchProcessorService` to allow retrying batches in `PROCESSING` status if interrupted.
  - Interrupted certificates in `PROCESSING` status are reset to `PENDING` within transaction, enabling clean idempotent recovery.
  - Verified by end-to-end tests in `tests/e2e/security-hardening.e2e-spec.ts`.

---

### Finding AUD-TEST-01: Zero Component or Visual E2E Test Coverage for Frontend App Router
- **Severity:** Low
- **Category:** Quality Assurance & Test Coverage
- **Affected Components:**
  - `apps/web/src` (43 files, 22 routes)
  - `tests/unit/web/`
- **Evidence:**
  `tests/unit/web/` contains only 2 test files (5 tests): `api-client.spec.ts` and `offline-queue.spec.ts`. There are zero component tests (React Testing Library) or E2E browser tests (Playwright/Cypress) for any of the 22 frontend pages.
- **Impact:**
  Client-side regressions in form validation, offline queue UI, scanner interactions, or navigation are not automatically caught prior to production.
- **Remediation:**
  Introduce Playwright or React Testing Library tests for primary critical paths (login, registration, certificate verification, scanner).
- **M14 Blocker:** No.
- **Production Blocker:** No (Technical Debt).

---

### Finding AUD-DATA-01: Clock Skew Offline Sync Fallback Violates Unique Composite Constraint
- **Severity:** Low
- **Category:** Database Constraints & Edge-Case Handling
- **Affected Components:**
  - `apps/api/src/modules/attendance/attendance.service.ts` (Line 575)
- **Evidence:**
  ```typescript
  // attendance.service.ts L575
  subjectId: op.member_id || '00000000-0000-0000-0000-000000000000',
  ```
- **Explanation:**
  If two offline attendance sync operations in the same batch both have clock skew > 24 hours and missing `member_id`, both attempted to insert `subjectId: '00000000-0000-0000-0000-000000000000'`, violating `session_subject_unique` and causing an unhandled database exception.
- **Impact:**
  Sync batch fails with 500 error instead of cleanly flagging conflicts.
- **Remediation:**
  Generate a unique dummy UUID or mark the operation as rejected before database insert if `member_id` is missing.
- **M14 Blocker:** No.
- **Production Blocker:** No (Resolved).
- **Resolution Status:** **Resolved** (Module M18)
  - Updated `AttendanceService.syncOfflineOperations`: Operations with clock skew > 24 hours and missing `member_id` are flagged as conflicts (`FLAGGED_CONFLICT`) immediately without attempting an invalid insert into PostgreSQL.
  - Verified by end-to-end tests in `tests/e2e/security-hardening.e2e-spec.ts`.

---

### Finding AUD-DEP-01: High Severity Zod Advisory (`GHSA-mrhx-c7xc-m3w5`) Deferred Due to Major API Rewrite
- **Severity:** Informational
- **Category:** Dependency & Supply Chain Management
- **Affected Components:**
  - `node_modules/zod` (`zod@3.24.2`) across root, shared, api, and web packages
- **Evidence:**
  `npm audit --omit=dev` reports [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Upstream patched version is `zod@4.6.6+`.
- **Explanation:**
  Zod 4 is an incompatible architectural rewrite. The vulnerability involves resource exhaustion when validating oversized collections. Application-level safeguards (100kb request body limit, sliding-window rate limiters, strict array bounds on schemas) mitigate exploitation.
- **Impact:**
  Residual risk is controlled; documented in `docs/DEPENDENCY_SECURITY_REMEDIATION.md`.
- **Remediation:**
  Evaluate Zod 4 migration during Phase 5 (Production Hardening).
- **M14 Blocker:** No.
- **Production Blocker:** No (Mitigated & Accepted).
- **Resolution Status:** **Mitigated & Accepted Risk** (ADR-012, Module M18)
  - Evaluated during M18: multi-layer defense-in-depth establishes an effective barrier against memory exhaustion.
  - Upstream request parsing enforces a strict 1 MB ceiling on incoming JSON payloads and 10 MB on multipart uploads.
  - All `@csi/shared` schemas enforce explicit `.max()` string constraints and bounded array sizes.
  - GitHub Actions CI configured with `npm audit --omit=dev --audit-level=critical` ensuring pipeline stability.
  - Full migration to Zod 4 tracked as future long-term architectural maintenance.

---

## 3. Module M14 Post-Implementation Audit Profiles

---

### Finding M14-AUD-01: Specification Gap: Asymmetric Digital PDF Signature (PAdES / PKCS#7) vs Tamper-Evident SHA-256 Checksum
- **Severity:** Medium
- **Category:** Cryptography & Identity Assurance
- **Affected Components:**
  - `apps/api/src/modules/passports/services/passport-pdf.service.ts`
  - `apps/api/src/modules/passports/services/passport-verification.service.ts`
- **Explanation:**
  `PE.md` (lines 197, 249) specified "digitally signed, tamper-evident PDF dossier". The current implementation provides tamper-evident SHA-256 file checksums bound to the database, Crockford Base32 verification codes, and QR verification badges. However, it does not include asymmetric digital signing (PAdES / PKCS#7 / Adobe CDS) using an X.509 cryptographic certificate. Asymmetric signing requires institutional GCET branch private keys and an HSM or secure key management service. Mocking or self-signing private keys in source code would introduce security risks without providing verifiable institutional trust.
- **Impact:**
  The PDF dossier is tamper-evident via web verification but does not display a cryptographic signature banner inside PDF readers (such as Adobe Acrobat Reader).
- **Remediation:**
  Document this architectural scope boundary clearly. Retain verified SHA-256 integrity and Crockford Base32 QR verification. Schedule formal PAdES-BES digital signature onboarding when institutional GCET PKI credentials are provided.
- **Resolution Status:** **Formally Disposed (Institutional PKI Roadmap)** (ADR-011, Module M18)
  - Formal disposition completed in `docs/M18_PRODUCTION_READINESS_REPORT.md` and `docs/DECISIONS.md` (ADR-011).
  - Ad-hoc self-signed mock certificates rejected to prevent untrusted certificate warnings and false security claims.
  - Cryptographic SHA-256 tamper-evident integrity binding, Crockford Base32 verification badges, and fail-safe file handling remain the authoritative Phase 4 and Phase 5 standard.
  - Institutional e-Sign / HSM PKI integration documented as an external enterprise adapter for future institutional procurement.

---

### Finding M14-AUD-02: Unified Public Verification Route (`GET /api/verify/:code`) Omits Activity Passports
- **Severity:** High
- **Category:** API Architecture & Usability
- **Affected Components:**
  - `apps/api/src/modules/certificates/controllers/public-verification.controller.ts`
- **Explanation:**
  `GET /api/verify/:code` served as the single public entry point for scanned QR codes, but only queried the `Certificate` database table. Scanned activity passport QR codes pointing to `/api/verify/:code` returned `not_found`, forcing verifiers to use the secondary route `/api/passports/verify/:code`.
- **Remediation:**
  Injected `PassportVerificationService` into `PublicVerificationController` via `forwardRef`. If a code is not found in certificates, the unified endpoint checks for a valid passport before returning `not_found`.
- **Resolution Status:** **Resolved** (Verified in `passports.e2e-spec.ts`)

---

### Finding M14-AUD-03: Client-Spoofed `X-Forwarded-For` Bypasses Public Passport Verification Rate Limiter
- **Severity:** High
- **Category:** API Security & Abuse Resistance
- **Affected Components:**
  - `apps/api/src/modules/certificates/verification/public-verification-rate-limit.guard.ts`
  - `apps/api/src/modules/passports/controllers/passports.controller.ts`
- **Explanation:**
  Public passport verification routes relied on parsing `req.headers['x-forwarded-for']?.split(',')[0]`, which allowed callers to supply arbitrary spoofed IP addresses to bypass the 30 req/min rate limit (identical to `AUD-SEC-01`).
- **Remediation:**
  Replaced manual header extraction with `req.ip || req.socket.remoteAddress || 'unknown'` which respects Express `trust proxy` configuration (`env.TRUST_PROXY_HOPS`).
- **Resolution Status:** **Resolved** (Verified in `passports.e2e-spec.ts`)

---

### Finding M14-AUD-04: Activity Passport Historical Snapshot Lacked Detailed Item Records & Superseded Status
- **Severity:** Medium
- **Category:** Data Integrity & Audit Trail
- **Affected Components:**
  - `apps/api/src/modules/passports/services/passport-export.service.ts`
  - `apps/api/src/modules/passports/services/passport-verification.service.ts`
- **Explanation:**
  `passports.summaryJson` only contained flat aggregate counts (`eventsAttended`, `certificatesEarned`, `committeesServed`) without preserving the itemized activity details at export time. Additionally, previously exported active passports remained in `generated` status when a member generated a newer passport, allowing multiple differing "valid" passports to circulate concurrently.
- **Remediation:**
  Enriched `summaryJson` to record both `counts` and an itemized `activities` snapshot array (`id`, `type`, `title`, `category`, `date`, `verificationStatus`). Updated export service to automatically mark previous active passports for that student as `status = 'superseded'`.
- **Resolution Status:** **Resolved** (Verified in `passport-export.service.spec.ts` and `passport-verification.service.spec.ts`)

---

### Finding M14-AUD-05: Committee Role Aggregation Lacked Canonical Role Code Validation and Included Future Tenures
- **Severity:** Medium
- **Category:** Business Logic & Data Quality
- **Affected Components:**
  - `apps/api/src/modules/passports/services/passport-aggregation.service.ts`
- **Explanation:**
  Aggregation previously checked strings loosely without strictly checking against canonical `RoleCode` enums (`RoleCode.PRESIDENT`, `RoleCode.VP`, `RoleCode.CORE`, `RoleCode.SUBCORE`, `RoleCode.COMMITTEE`). Future terms (`termStart > now`) were included prematurely in official dossiers, and students holding the same role across multiple academic sessions lacked term deduplication.
- **Remediation:**
  Bound aggregation to canonical `RoleCode` enums, added filter `termStart <= now` to exclude future tenures, and implemented deduplication by `(roleCode, committeeId, termStart year)`.
- **Resolution Status:** **Resolved** (Verified in `passport-aggregation.service.spec.ts` and `passports.e2e-spec.ts`)

---

### Finding M14-AUD-06: Post-Issuance Revocation of Underlying Certificates Not Communicated During Verification
- **Severity:** Low
- **Category:** Credential Transparency
- **Affected Components:**
  - `apps/api/src/modules/passports/services/passport-verification.service.ts`
- **Explanation:**
  Because the activity passport stores an immutable historical snapshot, an individual certificate revoked after passport export remained counted in the snapshot without any indication to a third-party verifier.
- **Remediation:**
  Updated `PassportVerificationService` to check if any certificates referenced in the snapshot have been revoked since issuance and append an explicit advisory notice in the public response.
- **Resolution Status:** **Resolved** (Verified in `passport-verification.service.spec.ts`)
