# CSI GCET Student Branch Platform
# Phase 3 – Module M13: Public Verification & Cryptographic Anti-Forgery
# Implementation & Verification Report

**Date:** 2026-10-31  
**Module:** Phase 3 – Module M13: Public Verification & Cryptographic Anti-Forgery  
**Repository Working Directory:** `C:\Users\HP\Desktop\Vedant\CSI-main`  
**Git Branch:** `main`  
**Status:** Completed & Verified  

---

## 1. Executive Summary

Module M13 completes **Phase 3: Certificates & Verifiable Credentials** for the CSI GCET Student Branch platform. It establishes a cryptographically bound, tamper-evident, privacy-preserving public verification system. Anyone can verify the authenticity, integrity, and validity of an issued certificate via a direct URL, manual verification code entry, or scanning the embedded high-resolution QR code, all without requiring an authenticated account or logging in.

Key technical achievements:
1. **High-Entropy Crockford Base32 Verification Codes**: Generated using 80 bits of cryptographic entropy (`crypto.randomBytes(10)`), encoded into 16 uppercase Crockford Base32 characters formatted as `XXXX-XXXX-XXXX-XXXX`. Code normalization handles lowercase conversion, whitespace/hyphen removal, and human visual error aliasing ($I, L \to 1$ and $O \to 0$).
2. **Database Anti-Forgery Binding**: The plain verification code is never stored in the database. Only its deterministic SHA-256 hash (`verification_code_hash VARCHAR(64) UNIQUE`) is persisted. This guarantees that read-only database snapshot leaks cannot compromise unissued or private verification credentials.
3. **Pure JavaScript QR Code Embedding**: Integrated `qrcode` (1.5.4) to render high-resolution PNG verification badges directly into vector PDFs via `pdf-lib`'s `embedPng`. The badge links directly to the canonical verification portal (`https://csi.gcet.edu.in/verify/<code>`) and is positioned cleanly inside double border geometries.
4. **On-Demand PDF Integrity Verification**: Public verification verifies both the database issuance record and on-demand SHA-256 file integrity (`storageService.verifyFileIntegrity`). Tampered PDF files or bit-rot trigger a distinct `integrity_mismatch` status.
5. **Privacy-Preserving Public Responses**: The public API strictly adheres to DPDP and privacy guidelines: recipient names and event titles are returned, but student enrollment numbers, email addresses, phone numbers, internal user IDs, and physical disk paths are completely excluded.
6. **Administrative Revocation & Transparency**: Authorized administrators (`cert.generate`) can revoke certificates with a mandatory reason. Revocation records update `revoked_at`, `revocation_reason`, and `revoked_by_id`, append an immutable audit log entry (`certificate.revoked`), and display transparent revocation warnings on the public portal.
7. **Sliding-Window IP Rate Limiting**: An in-memory sliding-window guard (`PublicVerificationRateLimitGuard`) protects public endpoints at 30 requests per minute per IP, responding with `X-RateLimit-*` and standard `Retry-After: 60` headers on HTTP 429 Too Many Requests.
8. **Frontend Verification Portal**: Dedicated Next.js routes at `/verify` and `/verify/[code]` featuring instant client-side format masking, error handling, responsive status badges (`valid`, `revoked`, `integrity_mismatch`, `not_found`), full adherence to "Indigo Lattice" design tokens, and WCAG 2.2 AA contrast compliance.

---

## 2. Architecture & Cryptographic Design

```mermaid
flowchart TD
    subgraph PDF Generation (M11 / M12 / M13)
        RNG[crypto.randomBytes 80-bit] -->|Crockford Base32| RawCode[16-Char Plain Code]
        RawCode -->|SHA-256| Hash[verification_code_hash]
        Hash -->|Store| DB[(PostgreSQL certificates)]
        RawCode -->|Canonical URL| QRGen[QRCode.toBuffer PNG]
        QRGen -->|embedPng| PDFEngine[pdf-lib Template Engine]
        PDFEngine -->|SHA-256 File Checksum| Disk[(Secure Storage /certificates)]
    end

    subgraph Public Verification (M13)
        User[Public Verifier / Scanner] -->|GET /verify/:code| Web[/verify/code Page]
        Web -->|GET /api/verify/:code| RateLimit{30 req/min IP Rate Limiter}
        RateLimit -->|Exceeded| Resp429[HTTP 429 Too Many Requests]
        RateLimit -->|Allowed| Norm[Normalize Code & Visual Aliases]
        Norm -->|SHA-256| SearchHash[Search Hash]
        SearchHash -->|Indexed Lookup| DB
        DB -->|Not Found| RespNotFound[Outcome: not_found / 404]
        DB -->|Found & Revoked| RespRevoked[Outcome: revoked]
        DB -->|Found & Active| IntegrityCheck{Verify Disk SHA-256}
        IntegrityCheck -->|Hash Mismatch| RespTampered[Outcome: integrity_mismatch]
        IntegrityCheck -->|Hash Matches| RespValid[Outcome: valid - 200 OK]
    end
```

### 2.1 Code Generation, Entropy, and Normalization
- **Entropy Source**: `crypto.randomBytes(10)` yielding 80 bits of cryptographic entropy.
- **Alphabet**: Crockford Base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, omitting `I`, `L`, `O`, `U`).
- **Formatted Representation**: `XXXX-XXXX-XXXX-XXXX` (4 groups of 4 characters).
- **Normalization Algorithm**:
  1. Strip all hyphens, spaces, and non-alphanumeric characters.
  2. Convert to uppercase.
  3. Map visual alias characters: `I` $\to$ `1`, `L` $\to$ `1`, `O` $\to$ `0`.
  4. Assert length equals 16 characters.

### 2.2 Privacy & Security Guarantees
- **Data Minimization**: Public responses never disclose:
  - Student enrollment number (`enrollmentNo` / `enrollment_no`).
  - Recipient email address or phone number.
  - Internal database IDs (`id`, `recipientId`, `batchId`).
  - Server storage paths (`storagePath`).
  - Stored verification code hash (`verificationCodeHash`).
- **Data Exposure**: Public responses only reveal:
  - Status (`valid`, `revoked`, `integrity_mismatch`, `not_found`, `invalid`).
  - Authenticity boolean (`isAuthentic`).
  - Public certificate number (e.g., `CSI-2026-FLUTTER-PARTICIPANT-A1B2C3D4`).
  - Certificate type (`participation`, `merit`, `completion`, `appreciation`).
  - Recipient full name.
  - Event title and completion/issue dates.
  - Issuing institution name (`Computer Society of India - GCET Student Branch`).
  - Revocation metadata (timestamp and reason, if revoked).

---

## 3. Database Migration & Schema Changes

### 3.1 Schema Additions (`schema.prisma`)
```prisma
model Certificate {
  id                   String            @id @default(uuid()) @db.Uuid
  batchId              String            @map("batch_id") @db.Uuid
  eventId              String            @map("event_id") @db.Uuid
  recipientId          String?           @map("recipient_id") @db.Uuid
  recipientName        String            @map("recipient_name") @db.VarChar(255)
  recipientEmail       String            @map("recipient_email") @db.Citext
  certificateNumber    String            @unique @map("certificate_number") @db.VarChar(64)
  certificateType      CertificateType   @map("certificate_type")
  storagePath          String?           @map("storage_path") @db.VarChar(512)
  fileHash             String?           @map("file_hash") @db.VarChar(64)
  status               CertificateStatus @default(pending)
  failureReason        String?           @map("failure_reason") @db.Text
  retryCount           Int               @default(0) @map("retry_count")
  verificationCodeHash String?           @unique @map("verification_code_hash") @db.VarChar(64)
  revokedAt            DateTime?         @map("revoked_at") @db.Timestamptz(6)
  revocationReason     String?           @map("revocation_reason") @db.Text
  revokedById          String?           @map("revoked_by_id") @db.Uuid
  revokedBy            User?             @relation("RevokedCertificates", fields: [revokedById], references: [id])
  issuedAt             DateTime?         @map("issued_at") @db.Timestamptz(6)
  createdAt            DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  batch CertificateBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)
  event Event            @relation(fields: [eventId], references: [id])
  user  User?            @relation(fields: [recipientId], references: [id])

  @@unique([eventId, recipientEmail, certificateType], name: "unique_event_recipient_cert_type")
  @@index([status])
  @@index([verificationCodeHash])
  @@index([revokedById])
  @@map("certificates")
}
```

### 3.2 SQL Migration (`20261104000000_certificate_verification_and_revocation`)
- Added columns: `verification_code_hash`, `revoked_at`, `revocation_reason`, `revoked_by_id`.
- Added unique index: `certificates_verification_code_hash_key` on `verification_code_hash`.
- Added indexes on `status` and `revoked_by_id`.
- Added foreign key constraint linking `revoked_by_id` to `users(id)` ON DELETE SET NULL.
- Granted `SELECT, INSERT, UPDATE, DELETE` permissions on `certificates` and `certificate_batches` to runtime role `csi_app`.
- Created reversible `down.sql` restoring previous schema state.
- Lifecycle validation executed: `scripts/test-migration-lifecycle.ts` verified UP $\to$ DOWN $\to$ UP cleanly on `csi_gcet_test` (10 migrations, 19 tables, exit code 0).

---

## 4. Backend Implementation Details

### 4.1 Verification Code Service (`verification-code.service.ts`)
- `generateVerificationCode()`: Produces 16-character Crockford Base32 string with 80-bit entropy.
- `normalizeCode(rawCode)`: Strips non-alphanumerics, converts to uppercase, replaces visual aliases ($I, L \to 1$, $O \to 0$).
- `isValidCode(code)`: Validates 16-character Crockford Base32 regex.
- `hashVerificationCode(normalizedCode)`: Computes deterministic `crypto.createHash('sha256').update(code).digest('hex')`.
- `formatVerificationCode(code)`: Formats 16 characters into hyphen-separated chunks `XXXX-XXXX-XXXX-XXXX`.
- `generateVerificationUrl(code)`: Constructs canonical public URL `https://csi.gcet.edu.in/verify/${code}`.

### 4.2 Certificate Verification Service (`certificate-verification.service.ts`)
- `verifyCertificate(code)`:
  1. Validates and normalizes user-provided verification code.
  2. Computes SHA-256 hash.
  3. Queries `certificates` table joined with `event`.
  4. Returns `not_found` if no matching record exists.
  5. If `status === 'revoked'` or `revokedAt !== null`, returns `status: 'revoked'`, `isAuthentic: false`, along with `revokedAt` and `revocationReason`.
  6. If active, performs file integrity check using `storageService.verifyFileIntegrity(storagePath, fileHash)`. If mismatch detected, returns `status: 'integrity_mismatch'`.
  7. If intact, returns `status: 'valid'`, `isAuthentic: true`, and complete public certificate details.
- `revokeCertificate(certificateId, adminUser, reason)`:
  1. Queries certificate record.
  2. If already revoked, returns idempotently.
  3. Updates certificate with `status = 'revoked'`, `revokedAt = new Date()`, `revocationReason = reason`, `revokedById = adminUser.id`.
  4. Appends audit log entry (`certificate.revoked`) with previous and new states.

### 4.3 Rate Limiting Guard (`public-verification-rate-limit.guard.ts`)
- In-memory sliding-window rate limiter keyed by client IP (`req.ip` or forward header).
- Max 30 requests per 60-second window.
- Injects standard headers:
  - `X-RateLimit-Limit: 30`
  - `X-RateLimit-Remaining: <remaining>`
  - `X-RateLimit-Reset: <timestamp>`
- Throws NestJS `HttpException` with HTTP 429 and `Retry-After: 60` header when threshold is breached.

### 4.4 Public Verification Controller (`public-verification.controller.ts`)
- `GET /api/verify/:code`: Public endpoint with `@Public()` and `@UseGuards(PublicVerificationRateLimitGuard)`.
- `GET /api/certificates/verify/:code`: Aliased public endpoint for route consistency.
- `POST /api/certificates/:id/revoke`: Admin endpoint protected by `@RequirePermission(PermissionCode.CERT_GENERATE)`.

### 4.5 Batch Processor & Template Engine Updates
- `certificate-batch-processor.service.ts`:
  - Generates 80-bit verification code for each certificate.
  - Passes `verification_code` and `verification_url` into template engine context.
  - Stores `verification_code_hash` in PostgreSQL transaction during issuance.
  - Concurrency lock refactored to `Map<string, Promise<void>>` guaranteeing thread-safe, non-dropped execution.
- `certificate-template-engine.service.ts`:
  - Pure JavaScript QR rendering via `QRCode.toBuffer(url, { type: 'png', width: 200, margin: 1 })`.
  - Embeds PNG into PDF via `pdfDoc.embedPng()`.
  - Draws QR badge inside page margins (bottom right by default) accompanied by legible verification text and human-readable code.

---

## 5. Frontend Public Verification Portal

### 5.1 Verification Entry Portal (`/verify`)
- Built at `apps/web/src/app/verify/page.tsx`.
- Features an accessible verification code entry field with instant client-side format masking (`XXXX-XXXX-XXXX-XXXX`).
- Displays security information cards explaining Crockford Base32 encoding, SHA-256 tamper evidence, and QR verification.

### 5.2 Verification Result Display (`/verify/[code]`)
- Built at `apps/web/src/app/verify/[code]/page.tsx`.
- Real-time client-side fetching with loading skeletons and automatic error recovery.
- Supports all 6 verification outcomes with dedicated, accessible status cards:
  - **Valid / Authentic**: High-contrast CSI Indigo header, emerald success banner, verified seal badge, recipient details, event metadata, and issue timestamps.
  - **Revoked**: Crimson alert banner, revocation timestamp, and administrative reason for revocation.
  - **Integrity Mismatch**: Amber warning banner indicating file hash divergence or document tampering.
  - **Not Found / Invalid**: Informational card explaining invalid code or unissued credential with suggestions.
  - **Rate Limited**: Warning informing user of excessive requests and providing retry countdown.
- 100% compliant with "Indigo Lattice" design tokens declared in `tokens.css`.
- WCAG 2.2 AA contrast verified across all states. Zero hardcoded colors.

---

## 6. Verification and Test Results

### 6.1 Shared Schemas Vitest Suite
```text
Test Files  12 passed (12)
Tests       81 passed (81)
Duration    1.19s
```
- Included 12 dedicated tests in `certificate-verification-schemas.spec.ts` testing Crockford Base32 regex, format validators, response schemas, and revocation inputs.

### 6.2 API Unit Test Suites
```text
Test Suites: 26 passed, 26 total
Tests:       194 passed, 194 total
Snapshots:   0 total
Time:        10.42 s
```
- Included 17 dedicated unit tests in `certificate-verification.service.spec.ts`:
  - Code generation entropy and length (80 bits, 16 characters).
  - Code normalization (case, separators, visual aliases $I, L \to 1$, $O \to 0$).
  - Valid verification with on-demand file integrity check.
  - Revoked verification returning reason and timestamp.
  - Integrity mismatch detection on tampered files.
  - Revocation workflow idempotency and audit logging.
- Included 33 unit tests across batch processor and template engine.

### 6.3 API E2E Test Suites
```text
Test Suites: 6 passed, 6 total
Tests:       73 passed, 73 total
Snapshots:   0 total
Time:        16.89 s
```
- Included dedicated E2E tests in `certificate-verification.e2e-spec.ts`:
  - Public endpoint `GET /api/verify/:code` without authorization token.
  - Verification of valid certificate with QR code and correct metadata.
  - Visual alias normalization verification via HTTP endpoint.
  - Non-existent code returning 404 with `not_found` outcome.
  - Revocation endpoint enforcing `cert.generate` permission.
  - Revoked certificate returning `revoked` outcome with reason.
  - File tampering causing `integrity_mismatch` outcome.
  - Public rate limiting enforcing 30 req/min with `Retry-After: 60` headers and 429 response.
  - Strict absence of sensitive fields (email, phone, enrollment number, internal IDs, file paths).

### 6.4 Web Unit Tests
```text
Test Files  2 passed (2)
Tests       5 passed (5)
```
- Verified `api-client.spec.ts` and `offline-queue.spec.ts`.

### 6.5 Code Quality, Design System & Lint Scans
- **Hardcoded Colors Scan**: `node scripts/check-hardcoded-colors.mjs` $\to$ **0 violations**.
- **WCAG Contrast Check**: `node scripts/check-contrast.mjs` $\to$ **All color pairs pass WCAG 2.2 AA requirements**.
- **Content Integrity Check**: `node scripts/check-content.mjs` $\to$ **0 violations** (no placeholder strings or dead links).
- **TypeScript Workspace Check**: `npm run typecheck` $\to$ **0 errors** across all packages.
- **Production Builds**: `npm run build` $\to$ Compiled `@csi/shared`, NestJS `@csi/api`, and Next.js `@csi/web` (22 static/dynamic routes) cleanly with exit code 0.

---

## 7. Conclusion

Module M13 has been implemented with complete fidelity to all security, cryptographic, and privacy requirements. Phase 3 (Certificates & Verifiable Credentials) is now fully realized and mathematically verified. The codebase is prepared for publication to `origin/main` and subsequent progression to Phase 4.
