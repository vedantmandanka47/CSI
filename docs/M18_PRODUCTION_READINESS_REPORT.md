# M18 Production Readiness & Hardening Report
## CSI GCET Student Branch Web Platform
**Milestone:** Module M18: Production Hardening & DPDP Privacy Audit  
**Date:** November 2026  
**Target Repository:** `CSI GCET Student Branch Platform (CSI-main)`  
**Branch:** `main`  
**Overall M18 Status:** **COMPLETE & VERIFIED**  
**Production Readiness Verdict:** **TECHNICALLY PRODUCTION-READY (PENDING INSTITUTIONAL SIGN-OFF)**

---

## 1. Executive Summary

Module M18 represents the comprehensive security, privacy, reliability, and production-hardening milestone of the CSI GCET Student Branch Platform. The platform has successfully transitioned from feature completeness across Phase 0 through Phase 4 to an operationally hardened, defense-in-depth posture.

All 7 pre-production audit findings from the Phase 3 Comprehensive Audit (`AUD-SEC-02`, `AUD-CERT-02`, `AUD-CERT-03`, `AUD-SEC-04`, `AUD-PERF-01`, `AUD-DATA-01`, `AUD-CI-01`) have been resolved. The platform satisfies DPDP Act 2023 technical requirements for data minimization, dedicated photo consent gating, and automated data retention and anonymization.

---

## 2. Platform Security Posture

| Domain | Control Mechanism | Evaluation Standard | Status |
|:---|:---|:---|:---:|
| **Authentication** | Argon2id password hashing, stateful server-side sessions, dual-cookie architecture (`csi_session`, `csi_csrf`), timing-safe comparisons | OWASP ASVS v4.0 Level 2 | **PASS** |
| **Authorization** | `DenyByDefaultGuard` across all controllers, dynamic RBAC permission matrix, committee workspace role isolation, expired tenure enforcement | Principle of Least Privilege | **PASS** |
| **Public Endpoint Defense** | Rate-limited verification routes (`/api/verify/:code`), sanitized `req.ip` handling, `@Public()` removed from `/api/id-card/verify` | OWASP API Security Top 10 | **PASS** |
| **Data Protection at Rest** | AES-256-GCM encryption for attendance TOTP secrets with `APP_ENCRYPTION_KEY`, immutable PostgreSQL audit triggers | Defense-in-Depth | **PASS** |
| **File Storage Security** | Binary magic-byte MIME validation, strict path traversal jailing (`STORAGE_ROOT_DIR`), SHA-256 PDF checksums, `AUD-CERT-01` fail-safe | CWE-22, CWE-434 | **PASS** |
| **Database Reliability** | Dual-role privilege separation (`csi_migrator` DDL, `csi_app` DML), GiST exclusion constraints for venue bookings, immutable audit ledger | PostgreSQL ACID & Security | **PASS** |

---

## 3. Privacy Posture (DPDP Act 2023)

| DPDP Control Area | Platform Engineering Implementation | Verification Status |
|:---|:---|:---:|
| **Data Minimization** | Member photographs gated by `photo_consent` (default `false`); suppressed if unconsented. Public verification returns only necessary credential metadata. | **PASS** |
| **Notice & Consent** | Mandatory guest consent flag (`GuestRegisterSchema.consent_data_processing: true`) with database timestamping (`consent_at`). Self-service photo consent toggle. | **PASS** |
| **Data Principal Rights** | Self-service profile queries, credential downloads, extracurricular dossiers (`/api/passports/me`), consent modification. | **PASS** |
| **Retention & Erasure** | Dedicated `RetentionService` with automated purging of expired sessions, tokens, idempotency records, and anonymization of event guests older than 90 days. | **PASS** |
| **Audit Ledger Privacy** | Dynamic presentation-tier anonymization of IP addresses in `audit_log` older than 90 days (`PRIV-06`). | **PASS** |

---

## 4. Production Configuration Hardening Review

- **Environment Validation (`env.ts`):** Startup fails fast with clear diagnostic messages if required secrets (`DATABASE_URL`, `SESSION_SECRET`, `CSRF_SECRET`, `APP_ENCRYPTION_KEY`) are missing, invalid, or shorter than 32 characters.
- **Secure Cookie Configuration:** Cookies enforce `httpOnly: true` (for session), `secure: isProduction`, `sameSite: 'lax'`, and explicit expiration.
- **Trusted Proxy:** Express `trust proxy` is configured to `1` so `req.ip` correctly extracts the client IP from the institutional reverse proxy (e.g., NGINX / Caddy) without trusting spoofed client-supplied `X-Forwarded-For` headers (`AUD-SEC-01`).
- **CORS Allowlist:** Origin reflection is strictly limited to configured origins (`PUBLIC_APP_URL`). Wildcard `*` origins are rejected.
- **Logging & Sensitive Data Redaction:** NestJS Pino HTTP logger redacts passwords, tokens, auth headers, cookie headers, emails, and phone numbers (`SEC-24`).
- **Body & Upload Limits:** JSON body limits capped at `1 MB`; multipart file uploads capped at `10 MB` per file.
- **Health Checks & Monitoring:** Liveness probe (`GET /api/health`) and Readiness probe (`GET /api/health/ready` verifying live PostgreSQL connectivity).
- **Graceful Shutdown:** `enableShutdownHooks()` registered on NestJS application instance, ensuring in-flight database transactions complete gracefully before process exit.

---

## 5. Supply Chain & Dependency Audit (`AUD-DEP-01`)

- **Audit Tool:** `npm audit --omit=dev --audit-level=critical`.
- **Results:** 0 critical vulnerabilities. 1 high-severity advisory: `zod <4.6.6` (`GHSA-mrhx-c7xc-m3w5`).
- **Risk Assessment:** `GHSA-mrhx-c7xc-m3w5` pertains to memory exhaustion during recursive validation of unbounded collections. In CSI GCET SB:
  - All incoming HTTP bodies are strictly limited to `1 MB` by Express body parser.
  - Zod schemas enforce explicit `.max()` string constraints and bounded collection lengths.
  - No recursive schemas are exposed to untrusted user input.
- **Verdict:** **Accepted Risk with Active Defense-in-Depth Mitigations**. Upgrading to Zod 4.x would introduce major breaking API changes across `@csi/shared`, `@csi/api`, and `@csi/web`. The risk is mitigated by input boundaries and tracked for post-handover major dependency upgrades.

---

## 6. M14 Digital Signature Disposition (`M14-AUD-01`)

### Technical Evaluation: SHA-256 Tamper Evidence vs Asymmetric Digital Signatures
The M14 audit noted a deferred specification requirement regarding asymmetric X.509 digital signing of generated Student Activity Dossier PDFs:

1. **Currently Implemented (Phase 4):**
   - Cryptographic SHA-256 file checksum generated at export time and recorded in `passports.file_hash`.
   - Immutable snapshot `passports.summary_json` freezing itemized activity records and metrics.
   - Crockford Base32 verification code with SHA-256 code hash recorded in `passports.verification_code_hash`.
   - Embedded QR code linking directly to `/verify/:code`.
   - Fail-safe missing-file and hash mismatch detection (`AUD-CERT-01` behavior).
2. **Asymmetric Digital Signing (PAdES / PKCS#7) Requirements:**
   - Standard: ETSI EN 319 142 (PDF Advanced Electronic Signatures - PAdES) or Adobe Approved Trust List (AATL).
   - Legal Framework: Section 5 of India's Information Technology Act, 2000 mandates that an electronic signature is legally recognized only if generated using a digital signature certificate issued by a licensed Certifying Authority (CA) under the Controller of Certifying Authorities (CCA India).
   - Hardware Dependency: Private signing keys must reside in a certified Hardware Security Module (HSM, FIPS 140-2 Level 3) or an institutional Key Management Service (KMS) with biometric / dual-custody access.
3. **M18 Architectural Decision:**
   - **Do NOT generate ad-hoc self-signed keys or hardcode private signing keys:** Generating fake or self-signed PKCS#7 signatures creates a false illusion of institutional endorsement without legal validity.
   - **Formally Track External Dependency:** The platform provides a clean extension interface (`PassportPdfService.signDossier`) for integrating with an institutional HSM, e-Mudhra, or GTU PKI gateway when provisioned by GCET administration.
   - **Status:** **DEFERRED (BOUNDED EXTERNAL DEPENDENCY)**. SHA-256 tamper-evident integrity hashes combined with online Base32 verification remain the authentic production mechanism for Phase 4.

---

## 7. Automated Testing & Verification Evidence

```
================================================================================
CSI GCET Student Branch Web Platform — Complete Verification Matrix
================================================================================
Test Category                     Suites/Files   Tests Run   Pass   Fail   Status
--------------------------------------------------------------------------------
API Unit Test Suite (Jest)                  38         291    291      0     PASS
Shared Unit Test Suite (Vitest)             16         116    116      0     PASS
Web Client Test Suite (Vitest)               2           5      5      0     PASS
E2E Integration Test Suite (Jest)           11         161    161      0     PASS
PostgreSQL Exclusion Constraint              1           6      6      0     PASS
Static Color Enforcement (check:colors)      1          83     83      0     PASS
WCAG 2.2 AA Contrast (check:contrast)        1           6      6      0     PASS
Content Marker Scan (check:content)          1          48     48      0     PASS
TypeScript Strict Typecheck                  3           3      3      0     PASS
ESLint Monorepo Rules                        1           1      1      0     PASS
Production Monorepo Build                    3           3      3      0     PASS
--------------------------------------------------------------------------------
TOTAL AUTOMATED TEST VERIFICATION                      723    723      0     PASS
================================================================================
```

---

## 8. Outstanding External Dependencies

While all software engineering controls within the scope of M18 are complete and passing, the following operational and institutional dependencies must be fulfilled by GCET administration prior to public domain go-live:

1. **Institutional Legal Sign-Off:** Qualified review of user-facing notices, privacy policies, and appointment of the institutional Data Protection Officer (DPO).
2. **Institutional PKI Provisioning:** Allocation of an institutional X.509 digital certificate and HSM gateway if PAdES PDF signing is required for placement office dossiers.
3. **Production Infrastructure Hosting:** Provisioning of production domain (`csi.gcet.ac.in`), TLS/SSL certificates, and PostgreSQL automated backup daemon (scheduled for Module M19).

---

## 9. Explicit Production Readiness Verdict

### Verdict: **TECHNICALLY PRODUCTION-READY (PENDING INSTITUTIONAL SIGN-OFF)**

The CSI GCET Student Branch Platform codebase has satisfied all technical criteria for Module M18. The platform is robust, secure, privacy-preserving, and free of known exploitable vulnerabilities within its operational boundaries.

