# CSI GCET Student Branch Platform — Maintainer Handover

**Document Classification:** Official Transition Document  
**Audience:** Incoming CSI GCET Student Branch Webmasters, Technical Leads, and Faculty Sponsors  
**Repository:** `C:\Users\HP\Desktop\Vedant\CSI-main` (`main`)  
**Handover Date:** November 1, 2026 (Module M19)  

---

## 1. Executive Summary & Purpose

This document serves as the comprehensive, self-contained maintainer handover manual for the official CSI GCET Student Branch web platform. It equips incoming student technical leaders and faculty advisors to operate, maintain, deploy, and govern the platform independently—without requiring undocumented knowledge from the founding engineering team.

The platform was built from the ground up to replace the legacy PHP/MySQL website with an enterprise-grade, type-safe, auditable, and resilient full-stack web application.

---

## 2. Monorepo Repository Structure

```
CSI-main/
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI quality gates (lint, test, build, E2E)
├── apps/
│   ├── api/                   # NestJS 11+ REST API backend
│   │   ├── prisma/            # Database schema & migrations
│   │   │   ├── migrations/    # 14 reversible migrations with down.sql
│   │   │   └── schema.prisma  # Authoritative Prisma relational schema
│   │   ├── src/
│   │   │   ├── common/        # Guards, filters, middleware, crypto, utilities
│   │   │   ├── config/        # Environment variable parsing (env.ts)
│   │   │   └── modules/       # Domain modules (auth, users, events, certificates, etc.)
│   │   └── storage/           # Private path-jailed file storage
│   └── web/                   # Next.js 15.5+ App Router frontend
│       ├── public/            # Static assets and official SVGs
│       └── src/
│           ├── app/           # App Router route handlers and pages (25 routes)
│           ├── components/    # UI components (navigation, modals, forms)
│           ├── content/       # Static marketing, timeline, and FAQ content
│           ├── lib/           # Client-side API caller and offline queue
│           └── styles/        # tokens.css ("Indigo Lattice" design tokens)
├── packages/
│   └── shared/                # Shared domain contracts, Zod schemas, permission matrix
├── scripts/
│   ├── database/              # Backup, restore drill, migration lifecycle, db-reset
│   ├── development/           # Secret generation utilities
│   ├── setup/                 # Initial super-admin bootstrap
│   └── validation/            # WCAG contrast, hardcoded colors, content scanners
├── storage/                   # Root storage directory (backups and archives)
├── tests/
│   ├── e2e/                   # 11 comprehensive End-to-End test suites (161 tests)
│   └── unit/                  # Centralized unit tests (412 tests across 56 suites)
└── docs/                      # Architectural decisions, audits, registers, and runbooks
```

---

## 3. Technology Stack & Key Architectural Principles

1. **Docker-Free Native Architecture:** Development and CI run natively on host systems without Docker virtualization overhead, delivering rapid build times and instant feedback loops.
2. **Permanent Light Mode ("Indigo Lattice"):** In accordance with project brand directives, the platform operates exclusively in light mode. Zero dark mode toggles or dark palette overrides are permitted. All colors, elevations, and radii are governed strictly by `apps/web/src/styles/tokens.css`.
3. **Strict Deny-by-Default Access Control:** Every backend route is protected by `DenyByDefaultGuard`. Routes are explicitly annotated with `@Public()`, `@Authenticated()`, or `@RequirePermission(PermissionCode.*)`. Unannotated routes fail closed with HTTP 403 Forbidden.
4. **Dual-Role PostgreSQL Isolation:**
   - `csi_migrator`: Owns the database schema and executes DDL migrations.
   - `csi_app`: Restricted runtime user with DML rights only (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). It cannot alter tables, drop columns, or create objects.
5. **Tamper-Evident Append-Only Audit Ledger:** The `audit_log` table is protected at the PostgreSQL engine level by trigger `prevent_audit_log_mutation`, strictly rejecting `UPDATE`, `DELETE`, and `TRUNCATE` queries.
6. **Double-Submit CSRF Protection:** All mutating endpoints (`POST`, `PATCH`, `DELETE`) require a double-submit CSRF cookie (`csi_csrf`) and matching `X-CSRF-Token` header.

---

## 4. Key Subsystems & Domain Lifecycles

### 4.1 Authentication & Sessions
- **Password Security:** Memory-hard Argon2id hashing with cryptographic salt.
- **Sessions:** Stateful sessions stored in PostgreSQL `sessions` table. Session cookies use `SameSite=Strict`, `HttpOnly`, and `Secure` attributes.
- **One-Time Tokens:** Single-use SHA-256 hashed tokens for email verification and password reset with strict expiration TTLs.

### 4.2 Membership, Roster & Roles
- **System Roles:** Fixed hierarchy: `ADMIN` (Level 100), `FACULTY` (Level 80), `PRESIDENT` (Level 70), `VP` (Level 60), `LEAD` (Level 50), `CO_LEAD` (Level 40), `CORE` (Level 30), `SUBCORE` (Level 20), `COMMITTEE` (Level 10), `MEMBER` (Level 5).
- **Roster Entries:** Student verification against official GCET enrollment rosters with sparse unique indexes.

### 4.3 Committee Workspaces & Dual-Role Contexts
- Tailored private hubs for 6 canonical committees: Technical, Content, Design, PR, Motion, Logistics.
- Strict tenure window validation (`termStart <= now <= termEnd`).
- Dual-role member context switcher in the web shell allowing core members to seamlessly toggle between multiple committee appointments without re-authenticating.

### 4.4 Verifiable Credentials & Extracurricular Dossiers
- **Certificates:** Rendered via pure-JS vector template engine (`pdf-lib`), Crockford Base32 verification codes, dynamic QR badges, and SHA-256 database checksum binding.
- **Fail-Safe Integrity (AUD-CERT-01):** If a generated certificate file is missing or its disk SHA-256 does not match the database, download rejects with HTTP 409 Conflict (`CERTIFICATE_FILE_UNAVAILABLE` or `CERTIFICATE_INTEGRITY_MISMATCH`). Dynamic unverified regeneration is permanently disabled to prevent issuing unverified duplicates.
- **Student Activity Passport:** Aggregates verified event attendance, issued certificates, and committee appointments. Exports multi-page vector PDF dossiers. Older passports are automatically transitioned to `superseded` when newer dossiers are compiled.

### 4.5 Task Management, Checklists & Asset Workflows
- **Committee Tasks:** Scoped to committee and optional event; assignee must hold active tenure in the committee.
- **Pre-Event Checklists:** Operational checklists with lead sign-off gates (`LEAD`, `CO_LEAD`, or branch executives).
- **Media Asset Repository:** Jailed file uploads with binary magic byte validation (PNG, JPEG, WEBP, PDF, SVG, MD), 10 MB limit, and SHA-256 integrity verification.

### 4.6 Annual Term Rollover & Archival
- Two-stage executive transition: Preview (`POST /api/admin/rollover/preview`) before atomic execution (`POST /api/admin/rollover/execute`).
- Closes outgoing student appointments (`termEnd = now`) while strictly preserving perpetual governance roles (`ADMIN` and `FACULTY`).
- Captures immutable historical snapshots (`term_snapshots`) freezing metrics and closing rosters for institutional reporting.

---

## 5. Security & DPDP Technical Privacy Controls

1. **Member Photo Consent (`photo_consent`):** Member photos are gated strictly behind explicit consent (`User.photoConsent`). When false, photo URLs serialize as `null` on public rosters. Members can toggle consent via `PATCH /api/users/:id/photo-consent`.
2. **Automated Retention Purging (`RetentionService`):** Background worker clearing expired sessions, tokens, idempotency records, and anonymizing guest attendee PII for events concluded > 90 days ago.
3. **Audit Log Presentation Anonymization:** Client IP addresses recorded in `audit_log` older than 90 days are dynamically masked as `[ANONYMIZED]` on service read (`PRIV-06`), preserving physical database trigger immutability.
4. **Encrypted Check-in Secrets at Rest (AUD-SEC-04):** Event attendance TOTP check-in secrets are encrypted using AES-256-GCM via `env.APP_ENCRYPTION_KEY` in PostgreSQL `attendance_sessions`.
5. **Authenticated QR Pass Scanners (AUD-SEC-02):** Attendee QR pass verification endpoint (`POST /api/id-card/verify`) requires authentication, `ATTENDANCE_TAKE` permission, and sliding-window rate limiting.

---

## 6. Disaster Recovery & Backup Procedures

### 6.1 Automated Backup Generation
```bash
# Generate full backup archive and manifest
npm run backup
```
- Creates `csi_backup_<db>_<timestamp>_<uuid>.dump` (PostgreSQL Custom Format `-Fc`).
- Creates companion `.storage.tar.gz` packaging certificates, passports, and media assets.
- Computes SHA-256 checksums and writes signed `manifest.json`.
- Enforces retention (default: keeps last 7 backups; older sets pruned safely).

### 6.2 Restoration Drill & Safety Safeguards
```bash
# Verify archive integrity and TOC without modifying database
npm run restore:drill -- --verify-only

# Execute restoration drill against designated empty test target
npm run restore:drill -- --target csi_gcet_restore_drill
```
- **Safety Safeguard:** `restore-drill.ts` inspects target table counts. If the target contains tables, it **refuses** to overwrite it and reports `SAFE-BLOCKED`.
- **Destructive Operations Disabled:** `DROP DATABASE`, `TRUNCATE`, and cascade resets are permanently disabled in restore tooling.

---

## 7. Institutional Ownership & Access Transfer Guide

When transitioning platform ownership between graduating executive boards and incoming webmasters:

### 7.1 GitHub Repository Ownership
1. Go to repository **Settings $\to$ Collaborators and teams**.
2. Invite incoming Webmaster and Faculty Advisor as Admin / Maintainer collaborators.
3. Transfer GitHub repository ownership to the official CSI GCET organization account if applicable.
4. Update branch protection rules on `main` requiring pull requests and passing CI status checks.

### 7.2 Hosting & Server Access
1. Provision SSH keypairs for incoming maintainers on the production server.
2. Revoke SSH keys of graduating student maintainers.
3. Update server sudoers permissions according to least privilege.

### 7.3 Database & Environment Secrets Rotation
1. Update database passwords for `csi_migrator` and `csi_app` in PostgreSQL.
2. Update `apps/api/.env` with the new passwords.
3. Rotate cryptographic secrets:
   - Generate new `SESSION_SECRET` (>= 32 chars).
   - Generate new `CSRF_SECRET` (>= 32 chars).
   - Note: If `APP_ENCRYPTION_KEY` is rotated, existing attendance sessions must be re-encrypted or cleared.
4. Restart application processes via `pm2 reload all --update-env`.

### 7.4 Domain & DNS Management
1. Transfer DNS administrative access (Cloudflare / institutional registrar) to incoming faculty sponsor or branch president.
2. Verify SSL/TLS auto-renewal via Let's Encrypt / Certbot (`certbot renew --dry-run`).

### 7.5 Institutional Digital Signature (PKI) Onboarding
- As documented in ADR-011 and `M14-AUD-01`, legal electronic signing of activity passports under India's IT Act 2000 requires institutional DSC procurement from a licensed CA (e.g. eMudhra, Capricorn).
- When provisioned, integrate the institutional e-Sign / HSM API into `PassportPdfService.signDossier`.

---

## 8. Maintainer Contact & Escalation Roster

| Role | Initial Contact Point | Responsibilities |
|---|---|---|
| **Faculty Sponsor** | GCET IT Department Head | Institutional oversight, server access authorization, legal review |
| **Branch President** | Outgoing / Incoming President | Term rollover authorization, committee roster validation |
| **Branch Webmaster** | Outgoing / Incoming Webmaster | Server operations, deployments, backups, bug fixes, runbook updates |

---

*End of Maintainer Handover Manual.*

