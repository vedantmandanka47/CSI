# Risk Register and Traceability Matrix

This document tracks all recognized security, operational, architectural, and data risks for the CSI GCET SB platform, citing their mitigations and automated verification gates (Appendix E, QA-01 to QA-24).

---

## 1. Security & Privacy Risks (RR:SEC)

| Risk ID | Severity | Threat / Scenario | Enforced Mitigation & Engineering Controls | Verification Gate |
|---|:---:|---|---|---|
| **RR:SEC-01** | **P0** | Unauthorized access to administrative or committee endpoints via IDOR | Deny-by-default guard (ARCH-05); strict route-level `@RequirePermissions()` decorators; session role validation | Custom route coverage test; QA-01, QA-03 |
| **RR:SEC-02** | **P0** | Database compromise or SQL injection | Prisma parameterized queries; dual-role isolation (`csi_app` runtime DML only, cannot alter schema) | Migration lifecycle tests; INT-01, QA-02 |
| **RR:SEC-03** | **P0** | Tampering, retroactive alteration, or deletion of audit logs | Database trigger `audit_log_prevent_mutation()` raising exceptions on `UPDATE`, `DELETE`, `TRUNCATE`; privileges revoked from runtime role | Database trigger integration test; INT-01 |
| **RR:SEC-04** | **P0** | Weak password hashing or credential theft | Passwords hashed using Argon2id with memory-hard parameters; zero demo passwords or default accounts (Hard Rule 8) | Section 4.5; QA-07 |
| **RR:SEC-05** | **P0** | Accidental exposure of secrets in client bundles or public repositories | Build-output secret scan on `.next/static` via Gitleaks (SEC-32); pre-commit Gitleaks scan; `.env` gitignored | CI Gitleaks step; `gen:secrets`; QA-08 |
| **RR:SEC-06** | **P0** | Cross-Site Request Forgery (CSRF) or session hijacking | Double-submit CSRF tokens on mutating requests (SEC-09); `SameSite=Strict`, `HttpOnly`, `Secure` session cookies | CSRF integration tests; QA-06 |
| **RR:SEC-07** | **P1** | QR code cloning or attendance fraud at physical events | Rotating TOTP-like codes (30-second steps) with AES-256-GCM authenticated encryption of secrets at rest (`AUD-SEC-04`); verified against coordinator passkeys | Event attendance tests, `security-hardening.e2e-spec.ts`; QA-04 |
| **RR:SEC-08** | **P1** | Unauthorized file access or private media exposure | Uploads stored privately; pre-signed URLs with short TTL; public certificates display minimal data only | Storage tests; SEC-16, SEC-30 |
| **RR:SEC-09** | **P1** | Denial of Service (DoS) via oversized payloads or brute force | Body parser size limits (1 MB default, 10 MB upload); rate limiting on login/auth routes | API rate limit tests; SEC-28 |
| **RR:SEC-10** | **P1** | Third-party dependency vulnerability exploitation | `npm audit --omit=dev` in CI; action commit SHAs pinned (DEP-09); strict package version saving (`save-exact=true`) | `audit:deps`; DEP-04 to DEP-09 |
| **RR:SEC-11** | **P1** | Log data leaks exposing student PII or session tokens | Automatic pino redaction for `password`, `token`, `cookie`, `authorization`, `phone`, `email` | Pino redaction unit tests; SEC-24 |
| **RR:SEC-12** | **P1** | False claims of legal or regulatory compliance | Prohibition of unsupported claims ("DPDP compliant", "fully secure", "unhackable") | `check:content` scanner; PRIV-13 |
| **RR:SEC-13** | **P1** | Issuance or download of corrupted, tampered, or unverifiable certificates | Fail-safe handling on missing or corrupt files (AUD-CERT-01); strict SHA-256 integrity verification against database hash; zero unverified dynamic PDF regeneration; HTTP 409 Conflict with sanitized logging | `certificate-batch.service.spec.ts`, `certificate-batch.e2e-spec.ts` |
| **RR:SEC-14** | **P1** | Activity Passport tampering, unauthorized dossier generation, or unverified record padding | Pure-JS deterministic vector PDF generation; verified event attendance prerequisite; fail-safe file handling (409 on missing or tampered file); immutable SHA-256 hash matching; IDOR-protected user and admin endpoints | `passport-export.service.spec.ts`, `passports.e2e-spec.ts` |
| **RR:SEC-15** | **P1** | Student PII leakage, credential enumeration, or rate-limit bypass via public verification | Privacy-preserving public schema returning only verified summary counts and non-sensitive metadata (zero email, phone, enrollment numbers, or database UUIDs); anti-spoofing sliding-window IP rate limiting bound to Express-sanitized `req.ip` (30 req/min per IP, AUD-SEC-01 / M14-AUD-03) | `passport-verification.service.spec.ts`, `passports.e2e-spec.ts` |
| **RR:SEC-16** | **P2** | Misunderstanding of digital signature level (cryptographic PAdES vs SHA-256 checksum) | Explicit architectural boundary (ADR-005, ADR-011, M14-AUD-01); rejection of insecure mock private keys; tamper-evident SHA-256 database binding and QR verification active; formal X.509 PKI signing requires institutional e-Sign/HSM integration under IT Act 2000 | `docs/M18_PRODUCTION_READINESS_REPORT.md`, `docs/DECISIONS.md` |
| **RR:SEC-17** | **P1** | Cross-committee unauthorized data access (IDOR) or privilege escalation between committees | Server-side validation of active committee tenure on every workspace request; branch executives restricted to authorized oversight; 403 Forbidden with standard `WORKSPACE_ACCESS_DENIED` envelope on violations; append-only audit logging (`workspace.accessed`) | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` |
| **RR:SEC-18** | **P1** | Premature workspace access by future-elected committee members | Enforce `termStart <= now` in `AuthMiddleware` and `WorkspacesService` so upcoming terms cannot view private committee operations or member rosters before official term begins | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` |
| **RR:SEC-19** | **P1** | Unauthorized task assignment across committee boundaries (IDOR) | Server-side validation confirming assignee holds an active role assignment within the target committee or possesses branch executive oversight; rejects external assignees with 400 Bad Request (`TASK_ASSIGNMENT_INVALID`) | `tasks.service.spec.ts`, `tasks-checklists-assets.e2e-spec.ts` |
| **RR:SEC-20** | **P1** | Fraudulent or unverified pre-event checklist sign-offs | Sign-off endpoint restricted strictly to committee leads (`LEAD`, `CO_LEAD`), core leadership, or branch executives; duplicate sign-offs rejected with 409 Conflict (`CHECKLIST_RUN_ALREADY_SIGNED`); mandatory audit logging (`checklist_run.signed_off`) | `checklists.service.spec.ts`, `tasks-checklists-assets.e2e-spec.ts` |
| **RR:SEC-21** | **P1** | Media asset spoofing, malware execution, or binary tampering | Binary magic byte validation (PNG, JPEG, WEBP, PDF, SVG, MD); 10 MB strict size cap; jailed filesystem storage; on-download SHA-256 integrity re-verification (AUD-CERT-01 fail-safe pattern emitting 409 Conflict if missing or mismatched) | `assets.service.spec.ts`, `tasks-checklists-assets.e2e-spec.ts` |
| **RR:SEC-22** | **P1** | Premature or accidental annual term rollover execution | Two-phase rollover workflow (preview before execute); typed confirmation code (`CONFIRM_ROLLOVER_<CODE>`); `ROSTER_MANAGE` permission check; append-only audit trail (`term.rollover_executed`) | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` |
| **RR:SEC-23** | **P1** | Dangling privileged access for outgoing student committee leadership post-rollover | Atomic closure of student role assignments (`termEnd = now`) inside `$transaction`; immediate middleware access revocation (`COMMITTEE_TENURE_EXPIRED`) | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` |
| **RR:SEC-24** | **P0** | Accidental administrative lockout or platform breakage during rollover | Explicit query exclusion of `ADMIN` and `FACULTY` roles from tenure termination (`roleId NOT IN (excludedRoleIds)`); perpetual governance retained across academic terms | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` |
| **RR:SEC-25** | **P1** | Historical data loss or corruption during annual term transition | Zero cascade deletions of past records; immutable `term_snapshots` preserving metrics and closing roster; historical queries remain valid | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` |
| **RR:SEC-26** | **P1** | Unconsented publication or display of member photographs (DPDP violation) | Explicit `photo_consent` boolean column (default `false`); serialization gating in `UsersService` returning null photo when consent is absent; member self-service toggle via `PATCH /api/users/:id/photo-consent` | `users.service.spec.ts`, `security-hardening.e2e-spec.ts` |
| **RR:SEC-27** | **P1** | Indefinite accumulation of guest attendee PII for past events | Automated `RetentionService` purging and anonymizing guest records for events concluded > 90 days ago; audit trail entry `RETENTION_PURGE_EXECUTED` | `retention.service.spec.ts`, `security-hardening.e2e-spec.ts` |
| **RR:SEC-28** | **P1** | Memory exhaustion from unbounded in-memory rate limiting keys | Periodic sliding-window cleanup interval (`evictExpired`) in `RateLimiterService` with unreferenced timer and graceful module teardown (`AUD-PERF-01`) | `rate-limiter.service.spec.ts` |
| **RR:SEC-29** | **P1** | Zombie certificate batch locks following host crashes | Automated batch crash recovery in `CertificateBatchProcessorService` resetting interrupted certificates to `PENDING` upon retry (`AUD-CERT-03`) | `security-hardening.e2e-spec.ts` |
| **RR:SEC-30** | **P1** | Idempotency replay attack modifying payload parameters | Cryptographic SHA-256 payload hash verification in `CertificateIssuanceService` rejecting altered request replays with 400 Bad Request (`AUD-CERT-02`) | `security-hardening.e2e-spec.ts` |

---

## 2. Version Control & Operational Risks (RR:VC)

| Risk ID | Severity | Threat / Scenario | Enforced Mitigation & Engineering Controls | Verification Gate |
|---|:---:|---|---|---|
| **RR:VC-01** | **P0** | Schema drift between migrations and database state | Hand-crafted reversible `down.sql` for every migration; mandatory UP $\to$ DOWN $\to$ UP test in CI | `scripts/database/test-migration-lifecycle.ts`; INT-11 |
| **RR:VC-02** | **P1** | Accidental commit of prompt files, instructions, or internal developer briefs | `.gitignore` rule matching `*prompt*.md` and `BUILD_PROMPT.md` strictly enforced | Pre-commit git status verification; Owner directive |
| **RR:VC-03** | **P1** | Destructive database commands run against wrong environment | `scripts/database/db-reset-dev.ts` validates `current_database() === 'csi_gcet_dev'` and immediately aborts otherwise | Safety check test; Section 4.4 |
| **RR:VC-04** | **P1** | Untracked configuration differences between development and production | 12-factor configuration; all environment variables documented in committed `.env.example` files | `env.ts` strict Zod schema validation; DEP-10 |

---

## 3. User Experience & Accessibility Risks (RR:UX)

| Risk ID | Severity | Threat / Scenario | Enforced Mitigation & Engineering Controls | Verification Gate |
|---|:---:|---|---|---|
| **RR:UX-01** | **P1** | Low contrast text causing readability barriers for visually impaired students | WCAG 2.2 AA contrast compliance enforced on all token pairings in light and dark themes (minimum 4.5:1 text ratio) | `scripts/validation/check-contrast.mjs`; UI-03 |
| **RR:UX-02** | **P1** | Visual and layout inconsistency from fragmented ad-hoc colors | Zero color literals outside `tokens.css`; Tailwind mapped exclusively to CSS custom properties | `scripts/validation/check-hardcoded-colors.mjs`; ADR-002 |
| **RR:UX-03** | **P1** | Vestibular discomfort or distraction from heavy animations | Respect for `prefers-reduced-motion`; app screen transitions $< 200\text{ms}$; only 2 signature motions on landing page | ADR-003; Section 7.7 |
| **RR:UX-04** | **P1** | Dead links, placeholder copy, or unreplaced templates in production | `scripts/validation/check-content.mjs` scans for `[CONTENT NEEDED]`, lorem ipsum, and `href="#"` placeholders | `npm run check:content`; Section 8.7 |

