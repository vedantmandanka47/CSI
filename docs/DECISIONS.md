# Architecture Decision Records (ADRs)

This document records the foundational architectural decisions made for the CSI GCET Student Branch official web platform.

---

## ADR-001: Modern Monorepo Tech Stack and Docker-Free Development

### Status
Accepted `[DECIDED]`

### Context
The legacy CSI GCET website was built with legacy PHP and MySQL, which suffered from architectural debt, loose typing, SQL injection vulnerabilities, lack of role-based authorization, and absent audit logging. A complete ground-up rewrite was required.
Furthermore, local developer workstations must remain lightweight and fast, without requiring Docker desktop virtualization or heavy container overhead.

### Decision
1. **Monorepo Structure:** Standard npm workspaces:
   - `apps/web`: Next.js 15.5+ App Router, React 19, Tailwind CSS.
   - `apps/api`: NestJS 11+, Express adapter, Prisma ORM, Pino logger, Helmet.
   - `packages/shared`: Shared domain contracts, Zod schemas, permission matrix, error envelope schemas built with `tsup`.
2. **Database:** PostgreSQL 16+ running natively on local host (port 5432).
   - Dual-connection model: `csi_migrator` (DDL owner) and `csi_app` (runtime DML only).
   - Append-only immutable `audit_log` with database triggers forbidding `UPDATE`, `DELETE`, and `TRUNCATE`.
3. **No Docker Rule:** All development and CI workflows run natively on the host or runner system without Docker or container services.
4. **Why NestJS was Chosen Over Alternatives:**
   - *Rejected PHP/MySQL:* Lacks modern type safety, modular dependency injection, and clean enterprise structure.
   - *Rejected Express alone:* Unopinionated and lacks standard modular guard, pipe, and interceptor abstractions, leading to architectural fragmentation.
   - *Rejected FastAPI / Django:* Dual-language cognitive overhead with a TypeScript/React frontend; shared Zod validation schemas cannot be reused across language boundaries.

### Consequences
- Strong end-to-end type safety between frontend, backend, and database.
- Faster local boot and test execution without virtualization friction.
- Clean separation of schema migration rights from runtime application query rights.

---

## ADR-002: "Indigo Lattice" Design System Token Enforcement

### Status
Accepted `[DEFAULT]`

### Context
To maintain brand cohesion, visual harmony, and accessibility compliance (WCAG 2.2 AA), styling must not rely on arbitrary or ad-hoc color literals scattered throughout component code.

### Decision
1. **Single Source of Truth:** All color values, elevation levels, and border radii are defined strictly once in `apps/web/src/styles/tokens.css`.
2. **Tailwind Mapping:** Tailwind utility classes map directly to CSS custom properties defined in `tokens.css`.
3. **Strict Prohibition:** No hex (`#fff`), `rgb()`, `rgba()`, `hsl()`, or `hsla()` literals are permitted in `.tsx`, `.ts`, or `.css` files outside `tokens.css`.
4. **Automated Enforcement:**
   - `scripts/validation/check-hardcoded-colors.mjs` runs on every CI build and fails if any literal is detected.
   - `scripts/validation/check-contrast.mjs` runs on every CI build and verifies WCAG 2.2 AA contrast ratios (minimum 4.5:1 for body text, 3.0:1 for graphical UI elements).

### Consequences
- Instant theme consistency across light and dark modes.
- Zero design drift or fragmented UI styles.
- Guaranteed adherence to WCAG 2.2 AA accessibility ratios.

---

## ADR-003: Landing Page Motion Policy Exception

### Status
Accepted `[DOCUMENTED EXCEPTION]`

### Context
Section 7.7 defines a strict motion policy for application screens (interactions must be subtle and complete under 200 ms). However, the public landing page (`/`) requires an engaging, narrative visual identity ("the thread") representing the student branch's interconnected community and history.

### Decision
1. **Application Screens:** Interaction animations remain strictly $< 200\text{ms}$, subtle, and only in direct response to user interaction.
2. **Landing Page Exceptions:** Exactly two signature motions are permitted on `/`:
   - The hero entrance sequence ($\le 1.5\text{s}$, executes once on initial mount).
   - The scroll-linked "thread" line coordinating narrative sections.
   - All other landing page sections remain static.
3. **Technique Constraint:** Animations are strictly limited to hardware-accelerated `transform` and `opacity` properties, with a single small inline SVG allowed `stroke-dashoffset` interpolation.
4. **Accessibility Override:** If `prefers-reduced-motion: reduce` is detected in user settings, all signature motions are immediately bypassed: the hero renders in its final resting state and the thread renders as a static visual line.

### Consequences
- Rich, distinctive landing page experience without degrading device performance.
- Full respect for user accessibility preferences and vestibular comfort.

---

## ADR-004: Student Activity Passport & Extracurricular Dossier Architecture (Module M14)

### Status
Accepted `[DEFAULT]`

### Context
Students require a consolidated, tamper-evident extracurricular passport compiling verified event attendance, earned certificates, and committee leadership roles for placements and higher education. The system must guarantee integrity, prevent IDOR vulnerabilities, protect student privacy upon public verification, and operate reliably without external heavy headless browser runtimes.

### Decision
1. **Activity Aggregation Integrity:**
   - **Events:** Included only when an `AttendanceRecord` exists with `status = 'verified'`. Unverified registrations (`Registration` alone) are strictly excluded. Multiple sessions of the same event are deduplicated.
   - **Certificates:** Included only when a `Certificate` has `status = 'generated'`. Revoked certificates are excluded. Files missing from disk are flagged with `certificateFileAvailable = false` to prevent broken download links.
   - **Committee Tenures:** Included when `RoleAssignment` has an assigned `committeeId` or a recognized leadership role (`core`, `subcore`, `committee`, `lead`, `head`, `chair`, `president`, `vp`). General membership (`RoleCode.MEMBER` with `committeeId = null`) is excluded from committee counts.
2. **Fail-Safe File Handling (AUD-CERT-01 Pattern):**
   - On download (`GET /api/me/passport/download` or `GET /api/passports/download/:id`), if the physical PDF file is absent from disk, the system throws HTTP 409 Conflict (`PASSPORT_FILE_UNAVAILABLE`) rather than regenerating an unverified document.
   - If the disk file SHA-256 hash differs from the database record, the system throws HTTP 409 Conflict (`PASSPORT_INTEGRITY_MISMATCH`).
3. **Pure Vector PDF Generation:**
   - Generated entirely in Node.js via `pdf-lib` and `qrcode` (zero Puppeteer/headless Chrome runtime dependencies).
   - Fonts use standard PDF Helvetica with WinAnsi character safety (avoiding unencodable Unicode symbols by using vector `drawCircle` geometric markers and ASCII dividers).
   - Layout supports dynamic multi-page flow, running page numbers (`Page X of Y`), student profile cards, metric summaries, and high-resolution Crockford Base32 verification badge.
4. **Cryptographic Verification & Privacy Preservation:**
   - Verification codes use 16-character Crockford Base32 (80 bits of cryptographic entropy) formatted as `XXXX-XXXX-XXXX-XXXX`.
   - The database stores only the deterministic SHA-256 hash (`verification_code_hash VARCHAR(64) UNIQUE`).
   - Public verification endpoints (`GET /api/passports/verify/:code` and `/api/verify/:code`) return only status (`valid`, `revoked`, `integrity_mismatch`, `not_found`, `invalid`), verified counts, student name, issue date, and branch. Internal UUIDs, email, phone, enrollment numbers, and storage paths are never leaked.
   - Public endpoints are guarded by a sliding-window IP rate limiter (30 req/min per IP).

### Consequences
- Complete, tamper-evident extracurricular dossiers acceptable to recruiters and accreditation bodies.
- Zero risk of counterfeit or regenerated mismatch documents.
- Complete student PII privacy during third-party QR code scanning.
- Ultra-fast, zero-overhead PDF generation within memory limits.

---

## ADR-005: Unified Credential Verification Gateway and Cryptographic Assurance Boundaries

### Status
Accepted `[DEFAULT]`

### Context
During post-implementation audit of Module M14, three critical architectural considerations emerged:
1. Verifiers scanning Crockford Base32 QR codes should not be required to know ahead of time whether a code represents a single event certificate or a cumulative activity passport.
2. Public verification endpoints protected by IP rate limiting were vulnerable to spoofed `X-Forwarded-For` headers if the application directly parsed headers rather than relying on Express's trusted proxy configuration.
3. Requirements in `PE.md` specified "digitally signed, tamper-evident PDF dossier". A formal boundary was required between hash-based tamper evidence and asymmetric digital signing (PAdES / PKCS#7).

### Decision
1. **Unified Credential Verification Gateway:**
   - `GET /api/verify/:code` is established as the single canonical public verification route.
   - `PublicVerificationController` queries `Certificate` records first. If unassigned, it delegates to `PassportVerificationService`.
   - Returns a unified polymorphic response payload: type (`certificate` or `passport`), verification status (`valid`, `revoked`, `integrity_mismatch`, `not_found`, `invalid`), recipient name, and non-sensitive metadata.
2. **Anti-Spoofing Rate Limiting:**
   - All rate-limiting guards and controllers must resolve client identity via `req.ip` (or `req.socket.remoteAddress`), relying on Express `trust proxy` configured via `TRUST_PROXY_HOPS`.
   - Direct extraction of raw `X-Forwarded-For` strings is strictly forbidden.
3. **Snapshot Immutability and Superseded Lifecycle:**
   - Passport exports freeze an itemized snapshot (`passports.summaryJson`) including both metrics and activity item arrays.
   - When a student generates a subsequent passport, prior active passports are automatically updated to `status = 'superseded'`.
   - Public verification of superseded passports returns an explicit status indicating that a newer version has replaced the document.
   - If an underlying certificate referenced in a frozen snapshot is revoked post-issuance, verification appends an advisory note without altering the immutable snapshot record.
4. **Cryptographic Assurance Scope:**
   - **Phase 4 Baseline (Implemented):** Tamper-evident integrity is guaranteed via SHA-256 database binding, high-entropy Crockford Base32 codes (80-bit random entropy), on-demand disk file integrity checks, and QR verification routing.
   - **Phase 5 Institutional PKI (Roadmap):** Asymmetric cryptographic digital signing (PAdES / PKCS#7) with embedded X.509 certificates requires institutional private keys and an HSM or secure secret store. Insecure mock keys or self-signed certificates are rejected. Formal PAdES signing is deferred until institutional key material is provisioned.

### Consequences
- Single frictionless QR scanning experience across all credential types for recruiters and verifiers.
- Robust protection against automated verification enumeration attacks even when behind proxies.
- Clean historical audit trail without phantom valid passports.
- Honest, rigorous cryptographic posture that avoids false security claims.

---

## ADR-006: Committee Workspace Authorization, Cross-Committee Jails, and Dual-Role Shell Architecture (Module M15)

### Status
Accepted `[DEFAULT]`

### Context
Branch volunteers and office-bearers operate across 6 canonical committees: Technical (`technical`), Content & Documentation (`documentation`), Design & Media (`graphics`), Public Relations (`pr`), Motion & Cinematography (`motion`), and Logistics & Operations (`logistics`).
Volunteers frequently hold assignments in multiple committees concurrently (e.g., Lead in Technical and Volunteer in Logistics), while branch leadership (`PRESIDENT`, `VP`, `ADMIN`) requires branch-wide executive oversight across all committees.
The system must prevent cross-committee unauthorized data access (IDOR), strictly enforce tenure validity boundaries, offer seamless UI context switching for dual-role members, and record immutable audit logs of workspace access.

### Decision
1. **Six Canonical Committees:** Formally standardized in database seed and domain enums (`packages/shared/src/enums/domain.enum.ts`):
   - `technical`: Technical Committee
   - `documentation`: Content & Documentation
   - `graphics`: Design & Media
   - `pr`: Public Relations
   - `motion`: Motion & Cinematography
   - `logistics`: Logistics & Operations
2. **Strict Server-Side Authorization & Cross-Committee Jails:**
   - Every workspace endpoint (`/api/me/workspaces`, `/api/workspaces/:committeeCode`, subroutes) validates the user's role assignment against the target committee.
   - Unauthorized attempts by non-members or members of other committees fail closed with HTTP 403 Forbidden (`WORKSPACE_ACCESS_DENIED`).
   - Branch executives (`PRESIDENT`, `VP`, `ADMIN`) receive branch-wide oversight with `isExecutive: true`.
3. **Active Tenure Window Enforcement:**
   - A role assignment is considered active if and only if `termStart <= now` and (`termEnd == null || termEnd >= now`), and `user.status == 'active'`.
   - Both `AuthMiddleware` and `WorkspacesService` enforce this window, blocking future-dated assignments (`COMMITTEE_TENURE_NOT_STARTED`) and expired tenures (`COMMITTEE_TENURE_EXPIRED`).
4. **Dual-Role UI Context Switching:**
   - If a member belongs to multiple committees, `/workspaces` displays a selection grid, and the header within `/workspaces/[code]` renders a context-switcher dropdown to jump between active committees.
   - For members with a single committee assignment, `/workspaces` automatically navigates directly to their workspace.
5. **Audit Trail:**
   - Every access to `/api/workspaces/:committeeCode` records an immutable audit log entry (`workspace.accessed`), capturing `actorId`, `targetType = 'committee'`, `targetId`, `ip`, and `afterJson: { committeeCode }`.

### Consequences
- Full protection against cross-committee privilege escalation and data scraping.
- Future elected committee members cannot preview private workspaces prior to their official term start date.
- Seamless, intuitive workflow for volunteers with multiple responsibilities.

---

## ADR-007: Task Lifecycle, Sign-Off Protocols, and Media Asset Pipeline Architecture (Module M16)

### Status
Accepted `[DEFAULT]`

### Context
Committee operations require structured operational tooling within the role-specific workspace shell (`/workspaces/[code]`):
1. Collaborative task tracking with committee-scoped boundaries, deadline monitoring, and assignee validation.
2. Event run checklists enabling repeatable operational readiness drills (e.g., stage checks, AV setup, speaker hospitality), where completion states are trackable per item and final execution requires verified sign-off accountability.
3. Media asset workflows for promotional banners, posters, and documentation copy requiring binary file integrity verification, file size limits, magic byte validation, and lead approval before publication.

Ad-hoc file uploads and unverified checklists present severe security risks: malicious executables could be uploaded, tasks could be assigned to unauthorized external users (IDOR), and event checklists could be falsely signed off by non-leadership members.

### Decision
1. **Committee-Scoped Task Management:**
   - Tasks are bound to a committee (`committee_id`) and optionally linked to an event (`event_id`).
   - Assignee membership validation: `tasks.service.ts` verifies that the `assignedToId` user holds an active role assignment in the target committee during the active tenure window, or possesses executive oversight (`PRESIDENT`, `VP`, `ADMIN`). If an external or inactive user is specified, creation fails with HTTP 400 Bad Request (`TASK_ASSIGNMENT_INVALID`).
   - Task lifecycle states: `todo`, `in_progress`, `in_review`, `completed`, `cancelled`. Status updates and deletions are restricted to committee members, creators, or leadership, capturing `task.created`, `task.updated`, and `task.deleted` in the append-only audit trail.
2. **Pre-Event Run Checklists & Verified Sign-Off Protocols:**
   - Checklists support reusable templates (`isTemplate: true`) and per-item toggling with audit timestamps (`completedAt`) and user accountability (`completedById`).
   - Checklist runs instantiate operational execution passes bound to specific events.
   - Lead-only sign-off gate: only committee leads (`LEAD`, `CO_LEAD`), core leadership, or branch executives can execute sign-offs. Duplicate sign-off attempts fail closed with HTTP 409 Conflict (`CHECKLIST_RUN_ALREADY_SIGNED`). Sign-offs record audit entries (`checklist_run.signed_off`).
3. **Media Asset Repository & Verification Pipeline:**
   - **Path-Jailed Storage:** Uploaded files are written strictly to an isolated disk directory (`storage/workspaces/assets`) with generated UUID filenames preventing path traversal.
   - **Magic Byte Inspection:** File contents are verified via binary header signatures (PNG, JPEG, WEBP, PDF, SVG, MD). Spoofed file extensions (e.g., executable disguised as `.png`) are rejected with HTTP 400 (`ASSET_INVALID_TYPE`).
   - **File Size Limit:** Enforced at 10 MB maximum. Larger uploads fail with HTTP 400 (`ASSET_FILE_TOO_LARGE`).
   - **Cryptographic Integrity & AUD-CERT-01 Fail-Safe Pattern:** Every uploaded asset is hashed with SHA-256 upon arrival and stored in `committee_assets.file_hash`. Downloads recalculate the on-disk SHA-256 checksum in real time; if the file is missing or the hash differs, the download aborts immediately with HTTP 409 Conflict (`ASSET_FILE_UNAVAILABLE` or `ASSET_INTEGRITY_MISMATCH`).
   - **Lead Review Workflow:** Leads or branch executives can review assets, transitioning them between `approved` and `rejected` with mandatory review notes, logged under `asset.reviewed`.
4. **Relational Data Integrity:**
   - Cascade deletion: when a committee is deleted, its tasks, checklists, and assets are cleanly removed.
   - Restrict on `createdBy` prevents deletion of users who created operational artifacts without explicit prior reassignment.

### Consequences
- Full IDOR prevention across committee task assignments and asset reviews.
- Strict anti-malware and file spoofing protection on all media assets.
- Immutable accountability for pre-event operational checklist sign-offs.

---

## ADR-008: Annual Committee Term Rollover, Historical Snapshot Preservation, and Alumnus Transition (Module M17)

### Status
Accepted `[DEFAULT]`

### Context
Student branch leadership and volunteer appointments transition annually at the end of each academic term (e.g. June 1 to May 31).
A naive rollover mechanism that simply overwrites committee memberships or wipes past tasks would destroy historical tenure records, corrupt student activity passports, and leave outgoing student leaders with active privileged access.
Conversely, closing all roles indiscriminately would terminate system administrator (`ADMIN`) and permanent faculty advisor (`FACULTY`) access, locking administrators out of the platform.

### Decision
1. **Academic Term Calendar Model:**
   - Dedicated `academic_terms` table with `draft`, `active`, and `archived` statuses, strict boundary validation (`startDate < endDate`), and a single `isCurrent = true` pointer.
   - Deletion of active or referenced terms is strictly prohibited (HTTP 400).
2. **Two-Stage Controlled Rollover Workflow:**
   - **Stage 1 (Preview & Health Check):** `POST /api/admin/rollover/preview` performs an audit without side effects: identifying outgoing committee appointments, identifying graduating 4th-year members, auditing unresolved workflows (open tasks, in-progress checklists, pending media assets), pre-validating incoming board appointments, and generating a unique confirmation safety code.
   - **Stage 2 (Atomic Execution):** `POST /api/admin/rollover/execute` executes inside a single database transaction (`$transaction`):
     - Closes outgoing student committee appointments (`termEnd = now`), immediately revoking active workspace privileges (`COMMITTEE_TENURE_EXPIRED`).
     - **Preservation of Permanent Governance:** Excludes `ADMIN` and `FACULTY` role codes from tenure termination (`roleId NOT IN (excludedRoleIds)`), ensuring unbroken system oversight across academic terms.
     - Optionally transitions verified graduating 4th-year students (`year >= 4`) to `UserStatus.GRADUATED`.
     - Optionally archives unresolved committee tasks to `cancelled` status.
     - Captures an immutable `term_snapshots` record freezing audit metrics (events, attendance, certificates, passports, tasks, assets) and the complete closing roster.
     - Seats incoming board appointments with `termStart = toTerm.startDate` and `termEnd = toTerm.endDate`.
     - Archives the outgoing term (`status = 'archived'`, `isCurrent = false`, `archivedAt = now`) and sets target term (`status = 'active'`, `isCurrent = true`).
     - Records `term_rollovers` execution metadata and writes an append-only audit log entry (`term.rollover_executed`).
3. **Safety & Idempotency Safeguards:**
   - Requires explicit typed confirmation code matching `CONFIRM_ROLLOVER_<TO_TERM_CODE>`.
   - Rejects duplicate rollovers or transitions into archived terms with HTTP 409 Conflict (`ROLLOVER_ALREADY_EXECUTED`).
4. **Historical Record Preservation:**
   - Zero cascading deletion of past events, registrations, attendance records, certificates, passports, or tasks during rollover.
   - Historical records remain queryable through snapshots and activity dossiers without polluting active operational workspaces.

### Consequences
- Completely safe, atomic transition between outgoing and incoming student leadership teams.
- Zero risk of locking administrators out of the platform.
- Full preservation of student extracurricular dossiers and verifiable credentials.
- Total immutability of historical snapshots for institutional reporting.

---

## ADR-009: DPDP Technical Privacy Controls, Photo Consent Gating, and Rolling IP Presentation Anonymization (Module M18)

### Status
Accepted `[DEFAULT]`

### Context
The Digital Personal Data Protection (DPDP) Act 2023 mandates technical controls for notice, explicit consent, purpose limitation, data minimization, and retention limits.
Photographs of students are identifiable personal data that must not be published or displayed without explicit consent.
Additionally, while `docs/DATA_INVENTORY.md` requires rolling 90-day retention for client IP addresses (`PRIV-06`), PostgreSQL trigger `audit_log_immutable_trigger` strictly prohibits `UPDATE`, `DELETE`, and `TRUNCATE` operations on `audit_log`, making direct physical database row modification illegal by design.

### Decision
1. **Explicit Photo Consent Tracking:**
   - Add database column `users.photo_consent` (default `false`) via reversible migration `20261108000000_photo_consent`.
   - Gate photo serialization in `UsersService`: if `user.photoConsent === false`, return `photo: null` on public, roster, and member profile endpoints.
   - Provide `PATCH /api/users/:id/photo-consent` enabling members to toggle their consent status, or administrators holding `ROSTER_MANAGE` permission.
2. **Audit Log Presentation Anonymization:**
   - Maintain the physical tamper-evident immutability of the PostgreSQL `audit_log` table by keeping the append-only trigger intact.
   - Enforce the 90-day retention policy (`PRIV-06`) at the service read tier (`AuditLogsService.findAll`): IP addresses recorded on rows with `createdAt` older than 90 days are dynamically transformed into `[ANONYMIZED]`.
   - This reconciles statutory privacy retention requirements with forensic ledger non-repudiation without circumventing database trigger security controls.

### Consequences
- Full technical compliance with DPDP consent and minimization principles.
- Zero unconsented photograph exposure across public or authenticated rosters.
- Forensic audit integrity is strictly preserved at the physical database layer.

---

## ADR-010: Automated Multi-Entity Retention Purging and Concluded Guest Anonymization (Module M18)

### Status
Accepted `[DEFAULT]`

### Context
In accordance with `PRIV-01` / `AUD-PRIV-01`, temporary tokens and expired sessions accumulate indefinitely in the database without automated background cleanup. Furthermore, guest attendees at public events provide personal data (name, email, phone) that must not be retained indefinitely once events conclude and reporting cycles lapse.

### Decision
1. **RetentionService Implementation:**
   - Created dedicated `RetentionService` in `apps/api/src/modules/maintenance/`.
   - Automated purging executes:
     - `sessions` where `expiresAt < now`.
     - `verification_tokens` where `expiresAt < now`.
     - `password_reset_tokens` where `expiresAt < now`.
     - `idempotency_keys` where `expiresAt < now`.
     - Anonymization of `event_guests` for events that concluded more than 90 days ago: sets `name = '[ANONYMIZED]'`, `email = 'anonymized_<id>@redacted.local'`, `phone = null`.
2. **Audited Maintenance Execution:**
   - Exposed `POST /api/admin/maintenance/retention/purge` guarded by `@RequirePermission(PermissionCode.AUDIT_VIEW)` and executive roles.
   - Records an immutable audit log entry (`RETENTION_PURGE_EXECUTED`) logging purged and anonymized record counts in `afterJson`.

### Consequences
- Continuous minimization of personal data footprint.
- Database indexes and storage overhead remain tightly bounded.
- Guest privacy protected following event completion.

---

## ADR-011: Cryptographic Integrity Verification vs Institutional X.509 PAdES Digital Signatures (Module M18)

### Status
Accepted `[DECIDED]`

### Context
Audit finding `M14-AUD-01` noted that while Module M14 generated tamper-evident activity passports and certificates with embedded Crockford Base32 verification codes and SHA-256 database checksums, it did not apply asymmetric X.509 PAdES (PDF Advanced Electronic Signatures) signed with a private key.

### Decision
1. **Refusal of Ad-Hoc Mock Keys:**
   - Generating an ad-hoc, self-signed local certificate in code provides zero legal non-repudiation and produces untrusted certificate warnings in PDF viewers (Adobe Acrobat, PDF-XChange).
   - Under Section 5 of the Information Technology Act, 2000 (India), legal electronic signatures require a digital signature certificate issued by a licensed Certifying Authority (e.g., eMudhra, Capricorn, NIC) tied to institutional signer identity, with private keys secured in a FIPS 140-2 Level 3 Hardware Security Module (HSM).
2. **Phase 4 & Phase 5 Architecture Baseline:**
   - Formalize SHA-256 tamper-evident integrity binding as the authoritative, verified Phase 4 and Phase 5 standard:
     - Every generated PDF has its SHA-256 checksum recorded in the database.
     - Downloads verify on-disk hash against database hash, failing closed with 409 Conflict if tampered (`AUD-CERT-01`).
     - Public verification routes compare verification code hashes in constant time and display issuance metadata.
   - Document institutional PKI integration boundary (`signDossier`) as an external enterprise adapter requiring institutional procurement of an e-Sign / HSM service.

### Consequences
- Eliminates false security illusions from invalid self-signed certs.
- Clear separation between application-level data integrity and institutional legal PKI infrastructure.

---

## ADR-012: Supply Chain Defense-in-Depth and Controlled Risk Acceptance for Zod GHSA-mrhx-c7xc-m3w5 (Module M18)

### Status
Accepted `[DECIDED]`

### Context
`npm audit --omit=dev` flags advisory [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) in `zod@3.24.2`. The advisory concerns memory exhaustion caused by uncontrolled schema parsing of recursively nested objects. The upstream fix exists only in `zod@4.x`, which introduces major breaking API changes that would require rewriting every schema in `@csi/shared`, `@csi/api`, and `@csi/web`.

### Decision
1. **Multi-Layer Defense-in-Depth:**
   - Enforce strict upstream payload size limits in NestJS/Express: `1 MB` ceiling on JSON request bodies (`express.json({ limit: '1mb' })`).
   - Limit multipart file uploads to `10 MB` with binary magic byte validation.
   - Enforce bounded string lengths (`.max()`) and bounded array collections across all `@csi/shared` schemas.
   - Enforce sliding-window rate limiting on all public, auth, and upload endpoints.
2. **CI Audit Policy:**
   - Accept `GHSA-mrhx-c7xc-m3w5` as a managed risk with verified defense-in-depth boundaries.
   - Configure CI dependency checking as `npm audit --omit=dev --audit-level=critical`.
   - Track full Zod 4 migration as future major architectural lifecycle work.

### Consequences
- Production build and CI gates remain reliable and unblocked.
- Effective immunity from memory exhaustion vectors via payload size ceilings.

---

## ADR-013: PostgreSQL Custom Format Backups, Cryptographic SHA-256 Manifests, and Jailed Retention (Module M19)

### Status
Accepted `[DEFAULT]`

### Context
Disaster recovery and backup resilience require a standardized, tamper-evident format that captures the complete PostgreSQL database schema, data, triggers, and sequences while remaining verifiable and portable. Plain SQL text dumps are large, lack structural indexing, cannot be selectively inspected or reordered during restoration, and are difficult to verify without loading into a database.

### Decision
1. **PostgreSQL Custom Archive Format (`-Fc`):**
   - Utilize `pg_dump -Fc` as the authoritative backup standard.
   - Embeds an internal compressed binary Table of Contents (TOC), allowing `pg_restore --list` validation without database connection.
   - Supports parallel and selective restoration with `--no-owner --no-privileges`.
2. **Cryptographic Checksum & Manifest Generation:**
   - Every generated backup archive is hashed with SHA-256.
   - A companion `manifest.json` is generated recording backup ID (UUID), timestamp, source database, table count, domain record counts, migration tag, and tool versions.
   - Verification re-computes the hash and strictly asserts matching checksums.
3. **Companion Storage Packaging:**
   - User uploads, certificates, passports, and media assets are packaged into a companion `.storage.tar.gz` archive with SHA-256 checksumming, ensuring application file assets can be restored in lockstep with the relational database.
4. **Path-Jailed Retention Enforcement:**
   - Retention pruning enforces a configurable keep count (default: 7) and strictly verifies that deletion targets reside within the resolved backup directory, preventing accidental deletion of unrelated system files.

### Consequences
- Compact, compressed, tamper-evident backup archives.
- Instant, non-destructive Table of Contents validation via `pg_restore --list`.
- Coordinated database and file storage recovery capability.

---

## ADR-014: Non-Destructive Disaster Recovery Restore Drills and Active Database Safety Refusal Policy (Module M19)

### Status
Accepted `[DEFAULT]`

### Context
Disaster recovery testing requires regular drill execution. However, executing restore scripts in an active environment poses severe operational hazards: a script could accidentally overwrite active development data, drop test databases with pending fixtures, or overwrite a production database.

### Decision
1. **Hard Safety Refusal on Populated Targets:**
   - The disaster recovery drill script (`scripts/database/restore-drill.ts`) connects to the target database and counts existing public tables before executing any write operations.
   - If the target database contains tables (`tbl_count > 0`), the script **refuses to write** to the database, logs a safety refusal notice, and safely concludes the live restoration phase as `BLOCKED (ISOLATED_TARGET_UNAVAILABLE)`.
2. **Prohibition of Destructive Commands:**
   - Destructive operations (`DROP DATABASE`, `TRUNCATE`, cascade resets) are permanently disabled in restore drill tooling.
3. **Multi-Stage Verification Model:**
   - The drill executes all non-destructive verification stages:
     - Checksum validation against manifest.
     - Table of Contents structural catalog parsing via `pg_restore --list`.
     - Companion file storage archive tar integrity inspection.
     - Target database safety boundary evaluation.
     - Automated markdown report generation recording drill metrics, RPO, and RTO.
   - Full live database write restoration requires an explicitly provisioned, verified empty scratch database (0 tables).

### Consequences
- Eliminates any risk of accidental data destruction during automated drills.
- Provides cryptographic assurance of backup archive viability without requiring risky database overwrites.
- Fully auditable drill reports with clear distinction between archive validation and live target provisioning.




