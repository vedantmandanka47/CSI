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


