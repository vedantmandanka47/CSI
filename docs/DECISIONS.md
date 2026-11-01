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

