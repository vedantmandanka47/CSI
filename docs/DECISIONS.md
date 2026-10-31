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

