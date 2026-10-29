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
| **RR:SEC-07** | **P1** | QR code cloning or attendance fraud at physical events | Rotating TOTP-like codes (30-second steps) signed with Ed25519; verified against coordinator passkeys | Event attendance tests; QA-04 |
| **RR:SEC-08** | **P1** | Unauthorized file access or private media exposure | Uploads stored privately; pre-signed URLs with short TTL; public certificates display minimal data only | Storage tests; SEC-16, SEC-30 |
| **RR:SEC-09** | **P1** | Denial of Service (DoS) via oversized payloads or brute force | Body parser size limits (1 MB default, 10 MB upload); rate limiting on login/auth routes | API rate limit tests; SEC-28 |
| **RR:SEC-10** | **P1** | Third-party dependency vulnerability exploitation | `npm audit --omit=dev` in CI; action commit SHAs pinned (DEP-09); strict package version saving (`save-exact=true`) | `audit:deps`; DEP-04 to DEP-09 |
| **RR:SEC-11** | **P1** | Log data leaks exposing student PII or session tokens | Automatic pino redaction for `password`, `token`, `cookie`, `authorization`, `phone`, `email` | Pino redaction unit tests; SEC-24 |
| **RR:SEC-12** | **P1** | False claims of legal or regulatory compliance | Prohibition of unsupported claims ("DPDP compliant", "fully secure", "unhackable") | `check:content` scanner; PRIV-13 |

---

## 2. Version Control & Operational Risks (RR:VC)

| Risk ID | Severity | Threat / Scenario | Enforced Mitigation & Engineering Controls | Verification Gate |
|---|:---:|---|---|---|
| **RR:VC-01** | **P0** | Schema drift between migrations and database state | Hand-crafted reversible `down.sql` for every migration; mandatory UP $\to$ DOWN $\to$ UP test in CI | `test-migration-lifecycle.ts`; INT-11 |
| **RR:VC-02** | **P1** | Accidental commit of prompt files, instructions, or internal developer briefs | `.gitignore` rule matching `*prompt*.md` and `BUILD_PROMPT.md` strictly enforced | Pre-commit git status verification; Owner directive |
| **RR:VC-03** | **P1** | Destructive database commands run against wrong environment | `scripts/db-reset-dev.ts` validates `current_database() === 'csi_gcet_dev'` and immediately aborts otherwise | Safety check test; Section 4.4 |
| **RR:VC-04** | **P1** | Untracked configuration differences between development and production | 12-factor configuration; all environment variables documented in committed `.env.example` files | `env.ts` strict Zod schema validation; DEP-10 |

---

## 3. User Experience & Accessibility Risks (RR:UX)

| Risk ID | Severity | Threat / Scenario | Enforced Mitigation & Engineering Controls | Verification Gate |
|---|:---:|---|---|---|
| **RR:UX-01** | **P1** | Low contrast text causing readability barriers for visually impaired students | WCAG 2.2 AA contrast compliance enforced on all token pairings in light and dark themes (minimum 4.5:1 text ratio) | `scripts/check-contrast.mjs`; UI-03 |
| **RR:UX-02** | **P1** | Visual and layout inconsistency from fragmented ad-hoc colors | Zero color literals outside `tokens.css`; Tailwind mapped exclusively to CSS custom properties | `scripts/check-hardcoded-colors.mjs`; ADR-002 |
| **RR:UX-03** | **P1** | Vestibular discomfort or distraction from heavy animations | Respect for `prefers-reduced-motion`; app screen transitions $< 200\text{ms}$; only 2 signature motions on landing page | ADR-003; Section 7.7 |
| **RR:UX-04** | **P1** | Dead links, placeholder copy, or unreplaced templates in production | `scripts/check-content.mjs` scans for `[CONTENT NEEDED]`, lorem ipsum, and `href="#"` placeholders | `npm run check:content`; Section 8.7 |

