# Module M12: Batch Certificate Generation & Idempotency
## Implementation & Verification Report

**Milestone:** Phase 3 — Module M12  
**Target Worktree:** `C:\Users\HP\Desktop\Vedant\CSI-main`  
**Branch:** `main`  
**Status:** **100% COMPLETE & VERIFIED**  
**Date:** October 31, 2026  

---

## 1. Executive Summary

Module M12 extends the M11 Pure JavaScript Certificate Template Engine into an enterprise-grade, asynchronous, idempotent batch certificate issuance system for the CSI GCET Student Branch platform.

The system delivers:
- **Attendance Verification Prerequisite**: Strict database validation ensuring certificates are generated only for eligible attendees possessing verified attendance records (`status = 'verified'`).
- **Database-Backed Idempotency & Mathematical Duplicate Prevention**: Dual-layer duplicate protection via `Idempotency-Key` header request caching and a PostgreSQL unique composite constraint `(event_id, recipient_email, certificate_type)` utilizing case-insensitive `CITEXT`.
- **Memory-Bounded Asynchronous Worker**: Controlled chunked background processing (10 certificates per chunk) preventing process memory spikes, equipped with atomic row-level concurrency locking and single-certificate failure isolation.
- **Resilient Failure Recovery**: Bounded retry workflow (`POST /api/certificates/batches/:id/retry`) capable of re-attempting failed certificates up to a maximum retry ceiling without repeating already completed generation.
- **Secure File Storage**: Directory-jailed local filesystem storage with SHA-256 integrity checksums and deterministic fallback vector re-synthesis.
- **Strict Download Authorization**: Access control enforcing that only authorized administrators/organizers (`cert.generate`) or verified certificate recipients can download PDFs, blocking unauthorized third parties with HTTP 403 Forbidden.
- **Member Self-Service**: Endpoints (`/api/me/certificates`, `/api/certificates/my`) empowering members to view and download all credentials awarded during their collegiate tenure.

---

## 2. Architecture & Subsystems

```mermaid
flowchart TD
    Client["Client / Organizer"] -->|POST /api/certificates/batches\n(Idempotency-Key)| Controller["CertificatesController\n(@RequirePermission('cert.generate'))"]
    Controller --> Issuance["CertificateIssuanceService"]
    
    subgraph "Batch Preparation & Idempotency"
        Issuance --> IdempCheck["IdempotencyKey Check\n(Cached Replay)"]
        Issuance --> Resolver["ParticipantResolverService\n(Verified Attendance Check)"]
        Issuance --> NumGen["CertificateNumberGeneratorService\n(Deterministic Numbering)"]
        Issuance --> Tx["PostgreSQL Transaction\n- Insert certificate_batches\n- Bulk insert certificates (status: pending)\n- Unique Constraint Guard\n- Append-only AuditLog"]
    end
    
    Issuance --> Processor["CertificateBatchProcessorService\n(Background Chunk Worker)"]
    
    subgraph "Processing & Persistence"
        Processor --> Lock["Atomic State Lock\n(status: processing)"]
        Processor --> Engine["M11 Vector Template Engine\n(pdf-lib PDF Synthesis)"]
        Processor --> Storage["CertificateStorageService\n(Jail + SHA-256 Checksum)"]
        Processor --> Update["Certificate & Batch State Finalization\n(completed / partially_completed / failed)"]
    end
```

### 2.1 Database Schema (`apps/api/prisma/migrations/20261103000000_certificates_and_batches/`)
1. **`certificate_batches`**:
   - `id`: UUID (Primary Key)
   - `eventId`: UUID references `events(id)` ON DELETE CASCADE
   - `templateId`: VARCHAR(100)
   - `templateConfig`: JSONB (snapshot of template configuration ensuring immutable historical rendering)
   - `certificateType`: VARCHAR(50) (`participation`, `merit`, etc.)
   - `status`: VARCHAR(50) (`pending`, `processing`, `completed`, `partially_completed`, `failed`, `cancelled`)
   - `totalCount`: INTEGER
   - `successCount`: INTEGER
   - `failedCount`: INTEGER
   - `createdById`: UUID references `users(id)` ON DELETE RESTRICT
   - `failureReason`: TEXT
   - `createdAt`, `updatedAt`, `completedAt`: TIMESTAMPTZ(6)
2. **`certificates`**:
   - `id`: UUID (Primary Key)
   - `batchId`: UUID references `certificate_batches(id)` ON DELETE SET NULL
   - `eventId`: UUID references `events(id)` ON DELETE CASCADE
   - `recipientType`: VARCHAR(20) (`member` | `guest`)
   - `recipientId`: UUID references `users(id)` ON DELETE SET NULL
   - `recipientEmail`: CITEXT NOT NULL
   - `recipientName`: VARCHAR(150) NOT NULL
   - `certificateType`: VARCHAR(50) NOT NULL
   - `certificateNumber`: VARCHAR(100) UNIQUE NOT NULL
   - `issueDate`: VARCHAR(50) NOT NULL
   - `achievement`: VARCHAR(200)
   - `metadata`: JSONB
   - `status`: VARCHAR(50) (`pending`, `processing`, `generated`, `failed`, `revoked`)
   - `storagePath`: VARCHAR(255)
   - `fileHash`: VARCHAR(64) (SHA-256)
   - `fileSizeBytes`: INTEGER
   - `errorReason`: TEXT
   - `retryCount`: INTEGER @default(0)
   - `issuedAt`, `createdAt`, `updatedAt`: TIMESTAMPTZ(6)
   - **Unique Duplicate Constraint**:
     `CONSTRAINT "event_email_cert_type_unique" UNIQUE ("event_id", "recipient_email", "certificate_type")`

### 2.2 Core Backend Services
- **`ParticipantResolverService`**:
  - Resolves participant lists based on `eligibilityMode`:
    - `verified_attendance`: Queries `attendance_records` where `status = 'verified'` for the event and resolves corresponding `users` and `event_guests`.
    - `all_registered`: Resolves all registered members (`registrations`) and guests (`event_guests`).
    - `explicit_selection`: Validates explicit lists against authoritative database records to block client tampering.
  - Automatically deduplicates records by normalized email.
- **`CertificateNumberGeneratorService`**:
  - Formats: `CSI-{YEAR}-{EVENT_ABBR}-{TYPE_ABBR}-{HEX_HASH}`
  - Uses SHA-256 of `eventSlug + email + type + year` to guarantee unique, clean, professional certificate serials.
- **`CertificateStorageService`**:
  - Stores PDFs under `storage/certificates/<batchId>/<certificateId>.pdf`.
  - Enforces strict path normalization and jail verification to prevent path traversal (`../`).
  - Computes and records SHA-256 checksums (`fileHash`).
  - Provides fallback deterministic re-rendering if files are moved or purged from ephemeral disks.
- **`CertificateBatchProcessorService`**:
  - Asynchronous background worker operating in chunks of 10 certificates.
  - Atomic state transitions (`updateMany` with `status: { in: ['pending', 'partially_completed'] }`) prevent concurrent duplicate worker runs.
  - Isolated try/catch per certificate: failed generation records `errorReason` and increments `retryCount`, allowing unaffected certificates to complete cleanly.
  - Automatic batch status calculation: `completed` (all succeeded), `partially_completed` (some failed), or `failed` (all failed).
  - `retryBatch`: Resets eligible failed certificates (`retryCount < maxRetries`) and re-dispatches the worker.
- **`CertificateIssuanceService`**:
  - Implements the complete batch lifecycle, `Idempotency-Key` checking, participant pre-filtering (skips already issued recipients), database transaction execution, audit log creation, and download ownership checks.

---

## 3. API Endpoints & RBAC Matrix

| Method | Endpoint | Permission / Auth | Description |
|---|---|---|---|
| `POST` | `/api/certificates/batches` | `@RequirePermission('cert.generate')` | Creates an idempotent batch, pre-resolves attendees, dispatches background generation |
| `GET` | `/api/certificates/batches` | `@RequirePermission('cert.generate')` | Paginated listing of certificate batches |
| `GET` | `/api/certificates/batches/:id` | `@RequirePermission('cert.generate')` | Retrieves real-time batch metrics, status, and progress percentage |
| `GET` | `/api/certificates/batches/:id/certificates` | `@RequirePermission('cert.generate')` | Paginated listing of certificates in a batch |
| `POST` | `/api/certificates/batches/:id/retry` | `@RequirePermission('cert.generate')` | Triggers bounded retry recovery for eligible failed certificates |
| `GET` | `/api/certificates` | `@RequirePermission('cert.generate')` | Filterable query of issued certificates across events |
| `GET` | `/api/certificates/:id/download` | `@Authenticated()` | Authorized PDF download (organizer with `cert.generate` OR certificate recipient; 403 for third parties) |
| `GET` | `/api/me/certificates` | `@Authenticated()` | Member self-service listing all issued certificates for the current user |
| `GET` | `/api/certificates/my` | `@Authenticated()` | Alias for `/api/me/certificates` |

---

## 4. Security & Data Integrity Verification

1. **Physical Duplicate Prevention**:
   - PostgreSQL unique composite constraint `event_email_cert_type_unique` physically rejects duplicate insertions at the database engine level (error code `23505`).
   - `CertificateIssuanceService` pre-checks existing certificates to return informative errors (`All eligible participants already have a certificate...`) without thrashing the database.
2. **Idempotency Guarantees**:
   - `Idempotency-Key` headers are tracked in `idempotency_keys` table with 24-hour TTL and sha256 request hash validation.
   - Repeated submissions immediately return the cached 201 response.
3. **Data Tampering & IDOR Protection**:
   - Authoritative participant names and emails are fetched directly from PostgreSQL `users` and `event_guests` rather than trusting untrusted client payloads.
   - Certificate downloading validates that the requester is either an authorized organizer holding `cert.generate` or the exact recipient matching `recipientId` / `recipientEmail`. Unauthorized third parties are denied with 403 Forbidden.
4. **Append-Only Audit Trail**:
   - Every batch creation generates an append-only `AuditLog` record (`CERTIFICATE_BATCH_CREATED`) detailing `event_id`, `recipient_count`, and `eligibility_mode`.
5. **Database Safety**:
   - `csi_gcet_dev` remains 100% intact with all persistent users and tables unharmed.
   - `csi_gcet_test` was used for all mutating integration and E2E tests with automated reverse-dependency cleanup in `afterAll`.

---

## 5. Test Execution Summary

### 5.1 Shared Package Unit Tests (`packages/shared`)
```text
Test Files  11 passed (11)
     Tests  69 passed (69)
```

### 5.2 API Unit Tests (`apps/api`)
```text
PASS src/modules/certificates/certificate-batch.service.spec.ts (12 tests)
PASS src/modules/certificates/certificate-engine.service.spec.ts (21 tests)
PASS src/modules/auth/auth.service.spec.ts
PASS src/common/crypto/tokens.spec.ts
PASS src/modules/attendance/attendance.service.spec.ts
PASS src/modules/venues/venues.service.spec.ts
PASS src/modules/dashboard/dashboard.service.spec.ts
PASS src/modules/id-card/id-card.service.spec.ts
PASS src/modules/admin/drive-windows.service.spec.ts
PASS src/modules/users/users.service.spec.ts
PASS src/modules/events/events.service.spec.ts
PASS src/modules/roles/roles.service.spec.ts
PASS src/modules/committees/committees.service.spec.ts
PASS src/modules/public/public.service.spec.ts
PASS src/modules/admin/member-admin.service.spec.ts
PASS src/modules/health/health.service.spec.ts
PASS src/modules/audit-logs/audit-logs.service.spec.ts
PASS src/common/guards/csrf.guard.spec.ts
PASS src/common/guards/deny-by-default.guard.spec.ts
PASS src/common/filters/global-exception.filter.spec.ts
PASS src/common/services/rate-limiter.service.spec.ts
PASS src/common/middleware/request-id.middleware.spec.ts
PASS src/common/guards/test-db-guard.spec.ts
PASS src/config/env.spec.ts
PASS src/common/crypto/totp.spec.ts

Test Suites: 25 passed, 25 total
Tests:       177 passed, 177 total
```

### 5.3 API End-to-End Tests (`apps/api`)
```text
PASS test/certificate-batch.e2e-spec.ts (14 tests)
PASS test/certificates.e2e-spec.ts (10 tests)
PASS test/auth.e2e-spec.ts
PASS test/rbac-audit.e2e-spec.ts
PASS test/app.e2e-spec.ts

Test Suites: 5 passed, 5 total
Tests:       58 passed, 58 total
```

### 5.4 Database Migration Lifecycle Verification
```text
UP -> DOWN -> UP verified cleanly across all 9 migrations on csi_gcet_test.
Exit Code: 0
```

### 5.5 Web Production Build (`apps/web`)
```text
✓ Compiled successfully
✓ Generating static pages (21/21)
✓ Finalizing page optimization
Exit Code: 0
```

---

## 6. Scope Boundary Compliance

| Milestone Item | Scope Status | Notes |
|---|:---:|:---:|
| Batch certificate issuance & requests | **Completed** | Full support for verified attendance & registered attendees |
| Database-backed idempotency & deduplication | **Completed** | `Idempotency-Key` caching + composite unique DB constraint |
| Attendance verification prerequisite | **Completed** | Validates against `AttendanceRecord` `status = 'verified'` |
| Background chunk processing & recovery | **Completed** | Memory-bounded chunks, atomic lock, failure isolation, retry |
| Authorized certificate downloads & self-service | **Completed** | Ownership verification, `/api/me/certificates` |
| Public verification portal (`/verify/[code]`) | **Excluded** | Scheduled for Module M13 |
| Crockford Base32 80-bit verification codes | **Excluded** | Scheduled for Module M13 |
| Cryptographic anti-forgery & revocation transparency | **Excluded** | Scheduled for Module M13 |

---

## 7. Conclusion

Module M12 has been implemented cleanly, thoroughly verified across all unit, integration, database, and E2E suites, and strictly satisfies all architectural, security, and idempotency requirements. The platform is ready for publication to `origin/main` and subsequent progression to Module M13.
