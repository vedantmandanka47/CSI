# Requirements Traceability Matrix

This matrix maps every functional requirement (`FR-`), architectural rule (`ARCH-`), security rule (`SEC-`), dependency rule (`DEP-`), and user interface rule (`UI-`) to its implementing code and automated test suites (Section 10.5 & Section 11 Gate).

---

## Phase 1 — Trustworthy Base

### Module M1: Errors, Env, Logging & Health Consolidation

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **ARCH-05** | Server-side deny-by-default authorization guard | `apps/api/src/common/guards/deny-by-default.guard.ts` | `apps/api/src/common/guards/deny-by-default.guard.spec.ts` | **VERIFIED** |
| **ARCH-15** | Standard error envelope (`{ error: { code, message, fields } }`), zero stack trace leaks in production | `apps/api/src/common/filters/global-exception.filter.ts` | `apps/api/src/common/filters/global-exception.filter.spec.ts`, `apps/api/test/app.e2e-spec.ts` | **VERIFIED** |
| **ARCH-16** | Strict Zod validation of environment variables; `env.ts` is sole reader of `process.env` | `apps/api/src/config/env.ts` | `apps/api/src/config/env.spec.ts` | **VERIFIED** |
| **ARCH-19** | `trust proxy` configured with exact hop count (never boolean `true`) | `apps/api/src/config/env.ts`, `apps/api/src/main.ts` | `apps/api/src/config/env.spec.ts` | **VERIFIED** |
| **SEC-02** | Security headers enforced via Helmet and `no-store` on error responses | `apps/api/src/main.ts`, `apps/api/src/common/filters/global-exception.filter.ts` | `apps/api/src/common/filters/global-exception.filter.spec.ts`, `apps/api/test/app.e2e-spec.ts` | **VERIFIED** |
| **SEC-24** | Automated PII redaction in structured Pino application logs | `apps/api/src/app.module.ts` | Pino configuration inspection; manual test | **VERIFIED** |
| **DEP-13** | Health endpoints: `/api/health` (liveness) and `/api/health/ready` (database check) | `apps/api/src/modules/health/health.controller.ts`, `health.service.ts` | `apps/api/src/modules/health/health.service.spec.ts`, `apps/api/test/app.e2e-spec.ts` | **VERIFIED** |
| **DEP-14** | Local storage driver forbidden in production; fails at startup | `apps/api/src/config/env.ts` | `apps/api/src/config/env.spec.ts` | **VERIFIED** |
| **UI-02** | Distinct operational, degraded, loading, and error states handled in UI | `apps/web/src/app/health/page.tsx` | Next.js build prerender & manual health probe | **VERIFIED** |

### Module M2: Users, Roles, Committees, Role Assignments & Roster

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-01** | User model, status lifecycle (`pending`, `active`, `inactive`, `suspended`), paginated listing | `apps/api/src/modules/users/users.service.ts`, `users.controller.ts`, `@csi/shared` | `apps/api/src/modules/users/users.service.spec.ts` | **VERIFIED** |
| **FR-02** | System roles, hierarchy lookup, committee-scoped roles | `apps/api/src/modules/roles/roles.service.ts`, `roles.controller.ts`, `@csi/shared` | `apps/api/src/modules/roles/roles.service.spec.ts` | **VERIFIED** |
| **FR-03** | Committees management and role assignment tracking | `apps/api/src/modules/committees/committees.service.ts`, `committees.controller.ts` | `apps/api/src/modules/committees/committees.service.spec.ts` | **VERIFIED** |
| **FR-04** | Roster entry validation and import schemas | `@csi/shared/src/schemas/roster.schema.ts`, `apps/api/prisma/schema.prisma` | Vitest `@csi/shared` test suite, migration tests | **VERIFIED** |
| **SEC-23** | Append-only audit log entries for status mutations and role assignment changes | `apps/api/src/modules/users/users.service.ts`, `scripts/setup/bootstrap-admin.ts` | `tests/unit/api/modules/users/users.service.spec.ts` | **VERIFIED** |
| **DEP-03 / PRIV-13** | Argon2id memory-hard hashing algorithm for privileged credentials | `apps/api/package.json` (`argon2`), `scripts/setup/bootstrap-admin.ts` | `scripts/setup/bootstrap-admin.ts` verified on `csi_gcet_dev` | **VERIFIED** |
| **Q-ADMIN-01** | Sparse unique index on nullable `enrollment_no` for non-student administrators | `apps/api/prisma/migrations/20261029000000_users_roles_roster/migration.sql` | `scripts/database/test-migration-lifecycle.ts` UP/DOWN test | **VERIFIED** |

### Module M3: Authentication & Sessions

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-05** | User registration / signup with strict validation and password strength enforcement | `apps/api/src/modules/auth/auth.service.ts`, `@csi/shared` | `auth.service.spec.ts`, `auth.e2e-spec.ts`, `auth-schemas.spec.ts` | **VERIFIED** |
| **FR-06** | Email verification workflow with SHA-256 hashed single-use tokens | `apps/api/src/modules/auth/auth.service.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **FR-07** | Credentials login with Argon2id memory-hard hashing and HttpOnly session cookies | `apps/api/src/modules/auth/auth.service.ts`, `tokens.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts`, `tokens.spec.ts` | **VERIFIED** |
| **FR-08** | Stateful database sessions (`sessions` table) and revocation upon logout | `apps/api/src/modules/auth/auth.service.ts`, `auth.middleware.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **FR-09** | Password reset flow invalidating all active user sessions | `apps/api/src/modules/auth/auth.service.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **ARCH-14 / SEC-04** | CSRF protection enforcing `X-CSRF-Token` header and `csi_csrf` cookie on mutating HTTP verbs | `apps/api/src/common/guards/csrf.guard.ts` | `csrf.guard.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **SEC-05 / SEC-06** | Sliding-window rate limiting on auth endpoints emitting standard 429 `RATE_LIMITED` | `apps/api/src/common/services/rate-limiter.service.ts` | `rate-limiter.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **SEC-23** | Append-only audit log tracking every authentication and credential mutation | `apps/api/src/modules/auth/auth.service.ts` | `auth.service.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |
| **ARCH-05** | Deny-by-default access control supporting `@Public()`, `@Authenticated()`, and `@RequirePermission()` | `apps/api/src/common/guards/deny-by-default.guard.ts` | `deny-by-default.guard.spec.ts`, `auth.e2e-spec.ts` | **VERIFIED** |

### Module M4: RBAC, Guards & Audit Logging Consolidation

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **ARCH-05** | Strict deny-by-default on all endpoints; unannotated routes fail closed with 403 Forbidden | `apps/api/src/common/guards/deny-by-default.guard.ts` | `deny-by-default.guard.spec.ts`, `rbac-audit.e2e-spec.ts` | **VERIFIED** |
| **ARCH-06** | Per-request RBAC evaluation directly from PostgreSQL; role mutations take immediate effect without relogin | `apps/api/src/common/middleware/auth.middleware.ts` | `rbac-audit.e2e-spec.ts` (dynamic role escalation test) | **VERIFIED** |
| **SEC-23** | Database-level trigger (`prevent_audit_log_mutation`) blocking all UPDATE, DELETE, and TRUNCATE attempts | `apps/api/prisma/migrations/20261028000000_init_foundation/migration.sql` | `scripts/database/test-migration-lifecycle.ts`, `tests/e2e/rbac-audit.e2e-spec.ts` | **VERIFIED** |
| **FR-10** | Protected audit log querying (`GET /api/audit-logs`) requiring `audit.view` permission with indexed filtering | `apps/api/src/modules/audit-logs/audit-logs.controller.ts`, `audit-logs.service.ts` | `audit-logs.service.spec.ts`, `audit-log-schemas.spec.ts`, `rbac-audit.e2e-spec.ts` | **VERIFIED** |

### Module M5: Web Base (Shell, Theme, Navigation & Auth UI)

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **UI-01 / ADR-002** | "Indigo Lattice" design tokens strictly in `tokens.css`; zero hardcoded color literals | `apps/web/src/styles/tokens.css`, `tailwind.config.ts` | `scripts/validation/check-hardcoded-colors.mjs`, `scripts/validation/check-contrast.mjs` | **VERIFIED** |
| **UI-02** | Distinct operational, loading, and error states handled in UI | `apps/web/src/app/health/page.tsx`, `apps/web/src/app/login/page.tsx` | Next.js build prerender & component tests | **VERIFIED** |
| **ADR-003** | Motion policy: micro-interactions < 200ms; `prefers-reduced-motion` honored | `apps/web/src/app/page.tsx`, `navbar.tsx` | Static inspection & Tailwind transition tokens | **VERIFIED** |
| **ARCH-14 / SEC-04** | Client-side API client auto-injects `X-CSRF-Token` header on mutating requests | `apps/web/src/lib/api-client.ts` | `apps/web/src/lib/api-client.spec.ts` | **VERIFIED** |
| **FR-11** | Responsive layout shell with official CSI logo, auth state context, and complete auth page flows | `apps/web/src/app/layout.tsx`, `navbar.tsx`, `footer.tsx`, `app/(auth)/*` | Next.js static build (14/14 pages) & Vitest | **VERIFIED** |

---

## Phase 2 — Public Experience & Branch Presence

### Module M6: Public Landing & Hero Experience, Event Discovery, Past Highlights

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **ARCH-05 / SEC-09** | Public endpoint for branch aggregates and drive window status without personal data | `apps/api/src/modules/public/public.controller.ts`, `public.service.ts` | `public.service.spec.ts` | **VERIFIED** |
| **UI-01 / ADR-002** | Design tokens strictly in `tokens.css`; zero hardcoded color literals | `apps/web/src/styles/tokens.css`, `hero-lattice.tsx` | `scripts/validation/check-hardcoded-colors.mjs`, `scripts/validation/check-contrast.mjs` | **VERIFIED** |
| **FR-LANDING-01** | Public Landing Page (`/`) with 10 structured sections, ISR revalidation (300s), and LCP budget | `apps/web/src/app/page.tsx`, `content/landing.ts` | `next build` prerender (14/14 pages, 115 KB first load) | **VERIFIED** |
| **FR-LANDING-02** | "The thread" vertical scroll progress indicator and accessible section navigation | `apps/web/src/components/landing/thread.tsx` | Static inspection & component prerender | **VERIFIED** |
| **FR-LANDING-03** | State-aware primary action reflecting active session without losing static rendering | `apps/web/src/components/landing/auth-action.tsx` | Next.js prerender & AuthContext | **VERIFIED** |
| **FR-LANDING-04** | Chapter journey & historical milestones responsive timeline | `apps/web/src/components/landing/timeline.tsx` | Prerender & responsive verification | **VERIFIED** |
| **FR-LANDING-05** | Native `<details>`/`<summary>` accessible FAQ accordion | `apps/web/src/components/landing/faq-section.tsx`, `content/faq.ts` | Prerender & HTML accessibility verification | **VERIFIED** |
| **SEC-07 / PRIV-13** | Zero invented statistics; strict non-personal aggregate counting; zero banned claims | `apps/web/src/app/page.tsx`, `content/landing.ts` | `scripts/validation/check-content.mjs` | **VERIFIED** |







### Module M7: Event Discovery, Registration & Calendar/ICS Subscriptions

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-EVT-01** | Relational schemas for `venues`, `events`, `registrations`, and `event_guests` with FK indexes and check constraints | `apps/api/prisma/schema.prisma`, `migration.sql` | `test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **FR-EVT-02** | Public filterable event discovery endpoint (`GET /api/events`) with status, category, date filters, and pagination | `apps/api/src/modules/events/events.service.ts`, `events.controller.ts` | `events.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-EVT-03** | Public event detail retrieval (`GET /api/events/:slug`) calculating live remaining capacity and user registration status | `apps/api/src/modules/events/events.service.ts` | `events.service.spec.ts` | **VERIFIED** |
| **INT-05 / SEC-05** | Concurrency-safe event registration using PostgreSQL `SELECT ... FOR UPDATE` row locks; zero overselling | `apps/api/src/modules/events/events.service.ts` | `events.service.spec.ts` (capacity & waitlist assertions) | **VERIFIED** |
| **PRIV-04 / DPDP** | Guest event registration with mandatory data processing consent and input validation | `apps/api/src/modules/events/events.controller.ts`, `@csi/shared` | `event-schema.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **INT-05** | Automatic waitlist promotion upon registration cancellation within atomic transaction | `apps/api/src/modules/events/events.service.ts` | `events.service.spec.ts` | **VERIFIED** |
| **SEC-22 / RFC-5545** | RFC 5545 iCalendar generation: single event download (`/api/events/:id/ics`) and calendar subscription feeds (`/api/events/calendar.ics`, `/api/calendar/feed.ics`) | `apps/api/src/modules/events/events.service.ts`, `calendar.controller.ts` | `events.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **UI-EVT-01** | Frontend Event Discovery page (`/events`) with search, category pills, status tabs, empty/loading states | `apps/web/src/app/events/page.tsx`, `event-filters.tsx`, `event-card.tsx` | Next.js build prerender, WCAG contrast scan | **VERIFIED** |
| **UI-EVT-02** | Frontend Event Detail view (`/events/[slug]`) with full overview, capacity progress, 1-click member register, and guest form | `apps/web/src/app/events/[slug]/page.tsx` | Next.js build compilation, zero hardcoded colors | **VERIFIED** |

### Module M8: Membership Onboarding & Verification

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-DRV-01** | Relational `drive_windows` model with `CHECK (closes_at > opens_at)` and unique `type` | `apps/api/prisma/schema.prisma`, `migration.sql` | `test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **FR-DRV-02** | Drive Window Management API (`GET /api/admin/drives`, `POST /api/admin/drives`, `POST /api/admin/drives/:type`, `PUT /api/admin/drives/:id`) with RBAC (`drive.toggle`) | `apps/api/src/modules/admin/drive-windows.service.ts`, `drives.controller.ts` | `drive-windows.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-DRV-03** | Dynamic public status aggregation (`GET /api/public/status`) consuming database-backed membership window | `apps/api/src/modules/public/public.service.ts` | `public.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-APP-01** | Student membership application review interface (`GET /api/admin/members/applications`) with enrollment number cross-referencing against official academic roster (`roster_entries`) | `apps/api/src/modules/admin/member-admin.service.ts`, `members.controller.ts` | `member-admin.service.spec.ts` | **VERIFIED** |
| **FR-APP-02** | Transaction-safe student approval (`POST /api/admin/members/applications/:id/approve`): status `active`, grants `member` role, immutable audit log | `apps/api/src/modules/admin/member-admin.service.ts`, `members.controller.ts` | `member-admin.service.spec.ts` | **VERIFIED** |
| **FR-APP-03** | Student application rejection (`POST /api/admin/members/applications/:id/reject`): status `inactive`, rejection reason logged, immutable audit log | `apps/api/src/modules/admin/member-admin.service.ts`, `members.controller.ts` | `member-admin.service.spec.ts` | **VERIFIED** |
| **SEC-20 / FR-IDC-01** | Digital Membership ID card API (`GET /api/me/id-card`, `GET /api/id-card/me`) enforcing active member standing and rejecting pending/inactive with 403 | `apps/api/src/modules/id-card/id-card.service.ts`, `me-id-card.controller.ts` | `id-card.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **SEC-20 / SEC-21** | Cryptographic rotating QR pass generation (HMAC-SHA256, 60s rotation, `timingSafeEqual` constant-time verification) | `apps/api/src/modules/id-card/id-card.service.ts`, `id-card.controller.ts` | `id-card.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **UI-M8-01** | Frontend Digital ID Card (`/id-card`) with dynamic rotating QR code display, 60s countdown timer, manual refresh button, eligibility states | `apps/web/src/app/id-card/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs` | **VERIFIED** |
| **UI-M8-02** | Frontend Drive Window Manager (`/admin/drives`) with live toggle switch, date modifier, and audit indicator | `apps/web/src/app/admin/drives/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs` | **VERIFIED** |
| **UI-M8-03** | Frontend Student Membership Review (`/admin/members`) with academic roster verification badge, approval action, rejection modal | `apps/web/src/app/admin/members/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs` | **VERIFIED** |

### Module M9: Member Self-Service Portal & Offline-Capable Check-in Operations

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-ATND-01** | Relational `attendance_sessions` and `attendance_records` schema with `CHECK (ends_at > starts_at)`, audience scoping, unique index on `(session_id, subject_type, subject_id)` and `client_uuid` | `apps/api/prisma/schema.prisma`, `migration.sql` | `test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **FR-ATND-02** | Attendance Session Lifecycle API (`GET /api/events/:eventId/attendance-sessions`, `POST /api/events/:eventId/attendance-sessions`, `POST /api/attendance/sessions/:id/close`) with RBAC (`attendance.take`, `attendance.manage`) | `apps/api/src/modules/attendance/attendance.service.ts`, `attendance.controller.ts` | `attendance.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-ATND-03** | Multi-Method Dynamic Check-In (`POST /api/attendance/check-in/qr`, `POST /api/attendance/check-in/totp`, `POST /api/attendance/check-in/manual`) with constant-time cryptographic verification and idempotent recording | `apps/api/src/modules/attendance/attendance.service.ts`, `attendance.controller.ts` | `attendance.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-ATND-04** | RFC 6238 TOTP projection session verification with 30s rotation and $\pm 1$ window tolerance | `apps/api/src/common/crypto/totp.ts`, `attendance.service.ts` | `totp.spec.ts`, `attendance.service.spec.ts` | **VERIFIED** |
| **FR-ATND-05** | Offline Attendance Synchronization Engine (`POST /api/attendance/sync`) reconciling buffered check-ins, detecting clock skew, flagging conflicts, and emitting audit logs | `apps/api/src/modules/attendance/attendance.service.ts`, `attendance.controller.ts` | `attendance.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-DASH-01** | Member Self-Service Dashboard API (`GET /api/me/dashboard`) returning profile summary, verified attendance statistics, upcoming event registrations, past attendance records, and activity timeline | `apps/api/src/modules/dashboard/dashboard.service.ts`, `dashboard.controller.ts` | `dashboard.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **UI-M9-01** | Member Self-Service Dashboard view (`/dashboard`) displaying member identity, attendance statistics, upcoming events, and registration history | `apps/web/src/app/dashboard/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs` | **VERIFIED** |
| **UI-M9-02** | Live Organizer Attendance Hub (`/admin/attendance`) with session creator, live attendee roster, projector podium mode, and rotating 6-digit TOTP display | `apps/web/src/app/admin/attendance/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs` | **VERIFIED** |
| **UI-M9-03** | Field Volunteer Scanner Station (`/scanner`) supporting camera viewfinder, Bluetooth 2D barcode scanner, 6-digit TOTP code entry, manual override with reason, offline IndexedDB queue, and reconciliation sync | `apps/web/src/app/scanner/page.tsx`, `offline-queue.ts` | Next.js build compilation, `offline-queue.spec.ts` | **VERIFIED** |

### Module M10: Campus Venue Registry & Mathematical Double-Booking Prevention

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-VEN-01** | Relational `venues` schema with building, room number, AV capabilities array, operational availability, active status, and positive capacity | `apps/api/prisma/schema.prisma`, `migration.sql` | `test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **FR-VEN-02** | Venue Management API (`GET /api/venues`, `GET /api/venues/:id`, `POST /api/venues`, `PUT /api/venues/:id`) with public data minimization and admin RBAC (`venue.book`) with immutable audit logging | `apps/api/src/modules/venues/venues.service.ts`, `venues.controller.ts` | `venues.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-VEN-03** | Live Pre-Booking Conflict Checker API (`POST /api/events/check-conflicts`) detecting active reservation overlaps and active venue standing before submission | `apps/api/src/modules/events/events.service.ts`, `events.controller.ts` | `events.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **FR-EVT-EXCL** | Native PostgreSQL `btree_gist` Exclusion Constraint (`events_venue_time_excl`) enforcing half-open interval `[start, end)` mathematical double-booking prevention; cancelled events excluded | `apps/api/prisma/migrations/20261102000000_venues_and_exclusion_constraint/migration.sql` | `scripts/validation/test-venue-exclusion.ts` (6/6 tests), `events.service.spec.ts` | **VERIFIED** |
| **ARCH-23P01** | Database engine SQLSTATE `23P01` exclusion violation translation to standard HTTP 409 `VENUE_CONFLICT` error envelope | `apps/api/src/modules/events/events.service.ts` | `events.service.spec.ts`, `app.e2e-spec.ts` | **VERIFIED** |
| **UI-M10-01** | Campus Venue Registry interface (`/admin/venues`) with building/capacity/AV filters, operational status badges, and modal create/update forms | `apps/web/src/app/admin/venues/page.tsx`, `navbar.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |
| **UI-M10-02** | Live Conflict Detector & Event Booking Terminal (`/admin/venues`) with real-time pass/conflict cards and database-protected reservation submission | `apps/web/src/app/admin/venues/page.tsx` | Next.js build compilation, WCAG 2.2 AA contrast scan | **VERIFIED** |

---

## Phase 3 — Certificates & Verifiable Credentials

### Module M11: Pure JavaScript Certificate Template Engine

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-CERT-01** | Pure JavaScript deterministic vector PDF generation engine using `pdf-lib` and `@pdf-lib/fontkit` (zero headless browser / Puppeteer dependencies) | `apps/api/src/modules/certificates/certificate-template-engine.service.ts` | `certificate-engine.service.spec.ts`, `certificates.e2e-spec.ts` | **VERIFIED** |
| **FR-CERT-02** | Shared certificate template schema, dimensions in points (72 DPI), borders, typography, image elements, and signatory blocks | `packages/shared/src/schemas/certificate-template.schema.ts` | `certificate-template-schemas.spec.ts` (8/8 tests) | **VERIFIED** |
| **FR-CERT-03** | Secure asset management with strict path traversal isolation, magic byte format verification (PNG/JPEG), and 5 MB size limit | `apps/api/src/modules/certificates/asset-manager.service.ts` | `certificate-engine.service.spec.ts` | **VERIFIED** |
| **FR-CERT-04** | Font management supporting standard PDF 14 fonts with styles and TrueType/OpenType fontkit embedding with magic byte verification | `apps/api/src/modules/certificates/font-manager.service.ts` | `certificate-engine.service.spec.ts` | **VERIFIED** |
| **FR-CERT-05** | Exact text layout engine with bottom-left PDF coordinate calculation, multi-alignment support (left, center, right), and dynamic font auto-downscaling | `apps/api/src/modules/certificates/layout-engine.service.ts` | `certificate-engine.service.spec.ts` | **VERIFIED** |
| **FR-CERT-06** | Safe dynamic placeholder interpolation (`{{recipient_name}}`, `{{event_title}}`, etc.) without `eval()` or `Function()` | `apps/api/src/modules/certificates/certificate-template-engine.service.ts` | `certificate-engine.service.spec.ts` | **VERIFIED** |
| **FR-CERT-07** | Built-in official CSI Participation and Merit certificate templates with institutional branding, double border, and corner ornaments | `apps/api/src/modules/certificates/certificate-template-engine.service.ts` | `certificate-engine.service.spec.ts`, `certificates.e2e-spec.ts` | **VERIFIED** |
| **FR-CERT-08** | Certificate Template API (`GET /api/certificates/templates/default`, `GET /api/certificates/fonts`, `POST /api/certificates/templates/validate`, `POST /api/certificates/preview`, `POST /api/certificates/render`) protected by RBAC (`cert.generate`) | `apps/api/src/modules/certificates/certificates.controller.ts` | `certificates.e2e-spec.ts` (10/10 tests) | **VERIFIED** |

### Module M12: Batch Certificate Generation & Idempotency

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-BATCH-01** | Relational `certificate_batches` and `certificates` schema with foreign keys, indexes, and unique composite constraint `(event_id, recipient_email, certificate_type)` | `apps/api/prisma/schema.prisma`, `20261103000000_certificates_and_batches/migration.sql` | `scripts/database/test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **FR-BATCH-02** | Participant resolution engine (`ParticipantResolverService`) enforcing verified attendance prerequisite (`AttendanceRecord` `status = 'verified'`) with authoritative database data lookups and deduplication | `apps/api/src/modules/certificates/participant-resolver.service.ts` | `certificate-batch.service.spec.ts`, `certificate-batch.e2e-spec.ts` | **VERIFIED** |
| **FR-BATCH-03** | Database-backed idempotent batch issuance (`Idempotency-Key` header tracking, cached replay, transactional batch creation) preventing double-generation under concurrent submissions | `apps/api/src/modules/certificates/certificate-issuance.service.ts` | `certificate-batch.service.spec.ts`, `certificate-batch.e2e-spec.ts` | **VERIFIED** |
| **FR-BATCH-04** | Collision-resistant, deterministic certificate number generator (`CSI-YYYY-EVENT-TYPE-HEX`) | `apps/api/src/modules/certificates/certificate-number-generator.service.ts` | `certificate-batch.service.spec.ts` | **VERIFIED** |
| **FR-BATCH-05** | Memory-bounded chunked background batch worker (`CertificateBatchProcessorService`) with atomic state transitions (`pending` -> `processing` -> `completed` / `partially_completed` / `failed`), row-level concurrency lock, and single-certificate failure isolation | `apps/api/src/modules/certificates/certificate-batch-processor.service.ts` | `certificate-batch.service.spec.ts`, `certificate-batch.e2e-spec.ts` | **VERIFIED** |
| **FR-BATCH-06** | Bounded retry recovery workflow (`POST /api/certificates/batches/:id/retry`) retrying only failed certificates up to max retry ceiling without re-processing generated certificates | `apps/api/src/modules/certificates/certificate-batch-processor.service.ts`, `certificates.controller.ts` | `certificate-batch.service.spec.ts`, `certificate-batch.e2e-spec.ts` | **VERIFIED** |
| **FR-BATCH-07** | Secure disk storage manager (`CertificateStorageService`) with directory traversal jails, SHA-256 integrity checksums, and deterministic fallback rendering | `apps/api/src/modules/certificates/certificate-storage.service.ts` | `certificate-batch.service.spec.ts` | **VERIFIED** |
| **FR-BATCH-08** | Authorized certificate downloading (`GET /api/certificates/:id/download`) enforcing strict ownership checks (admin with `cert.generate` or authenticated recipient), blocking unauthorized access with 403 Forbidden, and failing safely with 409 `CERTIFICATE_FILE_UNAVAILABLE` or `CERTIFICATE_INTEGRITY_MISMATCH` without unverified fallback regeneration (AUD-CERT-01) | `apps/api/src/modules/certificates/certificate-issuance.service.ts`, `certificates.controller.ts` | `certificate-batch.service.spec.ts`, `certificate-batch.e2e-spec.ts` | **VERIFIED** |
| **FR-BATCH-09** | Member self-service credentials listing (`GET /api/me/certificates`, `GET /api/certificates/my`) returning all issued certificates for the authenticated user | `apps/api/src/modules/certificates/me-certificates.controller.ts`, `certificates.controller.ts` | `certificate-batch.e2e-spec.ts` | **VERIFIED** |

### Module M13: Public Verification & Cryptographic Anti-Forgery

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-VERIFY-01** | High-entropy verification code generation (80-bit cryptographic random bytes -> 16-char Crockford Base32) and normalization (uppercase, strip separators, visual aliasing $I, L \to 1$, $O \to 0$) | `apps/api/src/modules/certificates/verification-code.service.ts` | `certificate-verification.service.spec.ts` | **VERIFIED** |
| **FR-VERIFY-02** | Anti-forgery database-level cryptographic binding storing deterministic SHA-256 hash (`verification_code_hash VARCHAR(64) UNIQUE`) preventing code leaks from database snapshots | `apps/api/prisma/schema.prisma`, `migration.sql` | `scripts/database/test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **FR-VERIFY-03** | Public verification endpoints (`GET /api/verify/:code`, `GET /api/certificates/verify/:code`) with privacy-preserving response schemas (never exposing email, phone, enrollment no, or internal IDs) | `apps/api/src/modules/certificates/public-verification.controller.ts`, `certificate-verification.service.ts` | `certificate-verification.service.spec.ts`, `certificate-verification.e2e-spec.ts` | **VERIFIED** |
| **FR-VERIFY-04** | Pure JavaScript QR code generation (`qrcode`) embedding high-resolution PNG verification badge into issued PDF certificates positioned cleanly within page borders | `apps/api/src/modules/certificates/certificate-template-engine.service.ts`, `certificate-batch-processor.service.ts` | `certificate-engine.service.spec.ts`, `certificate-verification.e2e-spec.ts` | **VERIFIED** |
| **FR-VERIFY-05** | On-demand SHA-256 PDF integrity verification (`storageService.verifyFileIntegrity`) detecting file tampering or bit-rot, returning `integrity_mismatch` outcome | `apps/api/src/modules/certificates/certificate-storage.service.ts`, `certificate-verification.service.ts` | `certificate-verification.service.spec.ts`, `certificate-verification.e2e-spec.ts` | **VERIFIED** |
| **FR-VERIFY-06** | Administrative certificate revocation (`POST /api/certificates/:id/revoke`) requiring `cert.generate` permission, mandatory reason, timestamp, and immutable audit logging (`certificate.revoked`) | `apps/api/src/modules/certificates/public-verification.controller.ts`, `certificate-verification.service.ts` | `certificate-verification.service.spec.ts`, `certificate-verification.e2e-spec.ts` | **VERIFIED** |
| **FR-VERIFY-07** | Sliding-window IP rate limiting guard (`PublicVerificationRateLimitGuard`) enforcing 30 req/min per IP with standard `X-RateLimit-*` and `Retry-After: 60` headers on public endpoints | `apps/api/src/modules/certificates/public-verification-rate-limit.guard.ts` | `certificate-verification.e2e-spec.ts` | **VERIFIED** |
| **UI-M13-01** | Frontend Public Verification Portal (`/verify` and `/verify/[code]`) with Crockford Base32 formatting, instant client-side validation, multi-state status cards (`valid`, `revoked`, `integrity_mismatch`, `not_found`), full Indigo Lattice tokens, and WCAG AA compliance | `apps/web/src/app/verify/page.tsx`, `apps/web/src/app/verify/[code]/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |

---

## Phase 4 — Beyond the Basics

### Module M14: Student Activity Passport & Extracurricular Dossier

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-PASS-01** | Multi-source activity aggregation consolidating verified event attendance (`AttendanceRecord` with `status = 'verified'`), active generated certificates (`Certificate` with `status = 'generated'`), and official committee tenures (`RoleAssignment` bound to canonical `RoleCode`), strictly excluding unverified registrations, revoked credentials, future terms (`termStart > now`), non-student roles, and deduplicating recurring tenures by year | `apps/api/src/modules/passports/services/passport-aggregation.service.ts` | `passport-aggregation.service.spec.ts` (8/8 tests), `passports.e2e-spec.ts` | **VERIFIED** |
| **FR-PASS-02** | Tamper-evident, multi-page vector PDF dossier generation engine using `pdf-lib` (zero Puppeteer/headless Chrome), official CSI GCET branding, student profile, summary metrics, categorized activity sections, running page numbers (`Page X of Y`), and high-resolution Crockford Base32 verification badge. (Note: Asymmetric X.509 PAdES digital signing tracked in M14-AUD-01 for Phase 5) | `apps/api/src/modules/passports/services/passport-pdf.service.ts` | `passport-pdf.service.spec.ts` (4/4 tests), `passports.e2e-spec.ts` | **VERIFIED** |
| **FR-PASS-03** | Secure filesystem storage manager (`PassportStorageService`) with directory traversal jails, SHA-256 integrity checksum calculation, file existence checks, and tamper verification | `apps/api/src/modules/passports/services/passport-storage.service.ts` | `passport-export.service.spec.ts`, `passports.e2e-spec.ts` | **VERIFIED** |
| **FR-PASS-04** | Passport Export and Download API (`POST /api/me/passport/export`, `GET /api/me/passport/download`, `POST /api/passports/user/:userId/export`, `GET /api/passports/download/:id`) enforcing strict IDOR protection, enriched itemized snapshots in `summaryJson`, invalidation of prior passports (`status = 'superseded'`), fail-safe download with 409 `PASSPORT_FILE_UNAVAILABLE` or `PASSPORT_INTEGRITY_MISMATCH`, and administrative delegation (`EXPORT_DATA` / `ROSTER_MANAGE`) | `apps/api/src/modules/passports/services/passport-export.service.ts`, `me-passport.controller.ts`, `passports.controller.ts` | `passport-export.service.spec.ts` (8/8 tests), `passports.e2e-spec.ts` | **VERIFIED** |
| **FR-PASS-05** | Public verification subsystem (`GET /api/passports/verify/:code` and unified `GET /api/verify/:code`) with Crockford Base32 code normalization, SHA-256 constant-time lookup, disk file integrity check, minimal privacy-preserving response schemas (zero PII leaks), post-issuance revocation advisory, and anti-spoofed 30 req/min IP sliding-window rate limiting (`req.ip`) | `apps/api/src/modules/passports/services/passport-verification.service.ts`, `passports.controller.ts`, `public-verification.controller.ts` | `passport-verification.service.spec.ts` (9/9 tests), `passports.e2e-spec.ts` | **VERIFIED** |
| **FR-PASS-06** | Administrative revocation workflow (`POST /api/passports/:id/revoke`) requiring `cert.generate` permission, mandatory reason validation, immutable audit log capture (`passport.revoked`), and immediate revocation reflection on public verification | `apps/api/src/modules/passports/services/passport-verification.service.ts`, `passports.controller.ts` | `passport-verification.service.spec.ts`, `passports.e2e-spec.ts` | **VERIFIED** |
| **FR-PASS-07** | Relational `passports` database table with foreign keys, compound indexes, unique verification code hash, and reversible migration lifecycle | `apps/api/prisma/schema.prisma`, `20261105000000_student_activity_passports/migration.sql` | `scripts/database/test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **UI-PASS-01** | Student Activity Passport web portal (`/passport`) with member identity summary, participation metrics, tabbed activity categorizations, instant PDF export, responsive layouts, Indigo Lattice design tokens, zero dark mode, and WCAG AA contrast compliance | `apps/web/src/app/passport/page.tsx`, `navbar.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |
| **UI-PASS-02** | Unified Public Credential Verification portal (`/verify/[code]` and `/verify/passport/[code]`) supporting both certificates and activity passports with dynamic status badges, summary metrics, and verified date metadata | `apps/web/src/app/verify/[code]/page.tsx`, `apps/web/src/app/verify/passport/[code]/page.tsx` | Next.js build compilation, `check-content.mjs` | **VERIFIED** |

### Module M15: Committee Workspaces & Role-Specific Shells

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-WS-01** | Committee Workspaces Discovery API (`GET /api/me/workspaces`) returning all authorized committee workspaces based on active role assignments, or all 6 canonical committees with `isExecutive: true` for branch leadership (`PRESIDENT`, `VP`, `ADMIN`) | `apps/api/src/modules/workspaces/workspaces.service.ts`, `workspaces.controller.ts` | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **FR-WS-02** | Committee Workspace Details API (`GET /api/workspaces/:committeeCode`) enforcing active membership tenure (`termStart <= now`, `termEnd == null || termEnd >= now`), user status = `active`, rejecting cross-committee access with 403 Forbidden (`WORKSPACE_ACCESS_DENIED`), and returning committee metadata, role capabilities, team members, and branch events | `apps/api/src/modules/workspaces/workspaces.service.ts`, `workspaces.controller.ts` | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **FR-WS-03** | Dual-Role Member Support and Cross-Committee Isolation, ensuring members holding assignments in multiple committees can access each authorized workspace while strictly preventing access to unauthorized committees | `apps/api/src/modules/workspaces/workspaces.service.ts`, `workspaces.controller.ts` | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **FR-WS-04** | Active Tenure Window Enforcement (`termStart <= now`, `termEnd == null || termEnd >= now`) applied across `AuthMiddleware` and `WorkspacesService`, blocking expired terms (`COMMITTEE_TENURE_EXPIRED`) and future terms (`COMMITTEE_TENURE_NOT_STARTED`) | `apps/api/src/common/middleware/auth.middleware.ts`, `workspaces.service.ts` | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **FR-WS-05** | Dedicated Subroute APIs (`GET /api/workspaces/:committeeCode/members` and `GET /api/workspaces/:committeeCode/events`) providing filtered roster and event operations protected by the committee tenure guard | `apps/api/src/modules/workspaces/workspaces.service.ts`, `workspaces.controller.ts` | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **FR-WS-06** | Append-only audit logging of workspace access (`workspace.accessed`) recording actor ID, committee ID, IP address, and committee code in `afterJson` | `apps/api/src/modules/workspaces/workspaces.service.ts` | `workspaces.service.spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **UI-WS-01** | Committee Workspaces Hub (`/workspaces`) with auto-redirect for single-committee members, selectable grid for multi-committee members/executives, and clear empty state for members without active committee assignments | `apps/web/src/app/workspaces/page.tsx`, `navbar.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |
| **UI-WS-02** | Role-Specific Committee Shell (`/workspaces/[code]`) with dual-role context switcher dropdown, role badge, metrics banner, tabbed views (Overview, Team Roster with search filtering, Operations & Capabilities), zero dark mode, WCAG AA compliance, and Indigo Lattice tokens | `apps/web/src/app/workspaces/[code]/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |

### Module M17: Annual Term Rollover & Archival

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **FR-TERM-01** | Academic Term Lifecycle Management supporting `draft`, `active`, and `archived` states, unique academic codes, strict date boundary validation (`startDate < endDate`), and single current term pointer | `apps/api/src/modules/terms/terms.service.ts`, `terms.controller.ts`, `@csi/shared` | `terms.service.spec.ts`, `m17-schemas.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-TERM-02** | Active Term Uniqueness & Integrity Protection preventing overlapping active terms, prohibiting deletion of active or referenced terms, and enforcing fail-closed status transitions | `apps/api/src/modules/terms/terms.service.ts` | `terms.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-TERM-03** | Academic Terms Management API (`GET /api/admin/terms`, `POST /api/admin/terms`, `GET /api/admin/terms/:id`, `PATCH /api/admin/terms/:id`, `DELETE /api/admin/terms/:id`) guarded by `@RequirePermission(PermissionCode.ROSTER_MANAGE)` and branch executive oversight (`ADMIN`, `PRESIDENT`, `VP`) | `apps/api/src/modules/terms/terms.controller.ts`, `terms.service.ts` | `terms.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-ROLL-01** | Rollover Transition Preview & Health Check Subsystem (`POST /api/admin/rollover/preview`) identifying outgoing committee appointments, identifying graduating 4th-year members, auditing unresolved workflows (open tasks, in-progress checklists, pending media assets), pre-validating incoming board appointments, and generating a unique confirmation safety code | `apps/api/src/modules/terms/rollover.service.ts`, `terms.controller.ts` | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-ROLL-02** | Atomic Rollover Execution Transaction (`POST /api/admin/rollover/execute`) executing within `$transaction`: terminating outgoing committee appointments (`termEnd = now`) while preserving perpetual administrator and faculty advisor tenures, transitioning verified graduating 4th-year students to `GRADUATED` status, archiving unresolved tasks, seating incoming board appointments with term dates, activating the target term, capturing immutable `TermSnapshot`, and recording `TermRollover` | `apps/api/src/modules/terms/rollover.service.ts`, `terms.controller.ts` | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-ROLL-03** | Rollover Safety & Idempotency Controls requiring typed confirmation code (`CONFIRM_ROLLOVER_<CODE>`), rejecting rollovers into archived or identical terms, preventing re-execution of archived source terms (409 Conflict), and recording complete execution summary metrics | `apps/api/src/modules/terms/rollover.service.ts`, `terms.controller.ts` | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-ROLL-04** | Post-Rollover Workspace Access & Committee Tenure Enforcement: outgoing committee leads immediately lose active access (`COMMITTEE_TENURE_EXPIRED`), newly seated incoming committee leads are immediately authorized in their committee workspace (`/api/workspaces/:code`) | `apps/api/src/common/middleware/auth.middleware.ts`, `workspaces.service.ts` | `term-rollover.e2e-spec.ts`, `workspaces.e2e-spec.ts` | **VERIFIED** |
| **FR-SNAP-01** | Immutable Historical Term Snapshot Subsystem (`GET /api/admin/terms/:id/snapshot`) preserving audit-grade metrics (events held, attendance verified, certificates issued, passports generated, tasks completed, assets approved) and complete frozen closing roster snapshot | `apps/api/src/modules/terms/rollover.service.ts`, `terms.controller.ts` | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-SNAP-02** | Rollover Execution History & Audit Trail (`GET /api/admin/rollover/history`) providing paginated audit records of past annual transitions, with append-only logs for `term.created`, `term.updated`, `term.deleted`, and `term.rollover_executed` | `apps/api/src/modules/terms/rollover.service.ts`, `terms.controller.ts` | `rollover.service.spec.ts`, `term-rollover.e2e-spec.ts` | **VERIFIED** |
| **FR-TERM-04** | Relational Database Models & Reversible Migration (`academic_terms`, `term_snapshots`, `term_rollovers`) with foreign keys, compound indexes, and UP -> DOWN -> UP test verification | `apps/api/prisma/schema.prisma`, `20261107000000_annual_term_rollover_and_archival/migration.sql` | `scripts/database/test-migration-lifecycle.ts` (UP->DOWN->UP) | **VERIFIED** |
| **UI-TERM-01** | Executive Academic Terms & Rollover Portal (`/admin/terms`) with active term hero banner, term listing table, status badges, quick links to membership and drives, zero dark mode, and WCAG AA contrast compliance | `apps/web/src/app/admin/terms/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |
| **UI-TERM-02** | Guided Annual Rollover Wizard Modal featuring target selection, transition preview with warnings, incoming board appointment form, and typed safety confirmation | `apps/web/src/app/admin/terms/page.tsx` | Next.js build compilation, `check-content.mjs` | **VERIFIED** |
| **UI-TERM-03** | Historical Term Snapshot Viewer Modal and Rollover Execution History Drawer displaying frozen metrics, closing rosters, and historical audit logs | `apps/web/src/app/admin/terms/page.tsx` | Next.js build compilation, `check-hardcoded-colors.mjs`, `check-contrast.mjs` | **VERIFIED** |

---

## Phase 5 — Production Hardening & Handover

### Module M18: Production Hardening & DPDP Privacy Audit

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **SEC-04-AES** | Authenticated AES-256-GCM encryption at rest for event attendance TOTP secrets (`AUD-SEC-04`), safeguarding secrets from physical database dump exposure | `apps/api/src/common/crypto/encryption.ts`, `attendance.service.ts` | `encryption.spec.ts`, `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **SEC-02-ID** | Authenticated and rate-limited QR pass verification endpoint (`POST /api/id-card/verify`) requiring `ATTENDANCE_TAKE` permission and sliding-window IP throttling (`AUD-SEC-02`), preventing anonymous student identity enumeration | `apps/api/src/modules/id-card/id-card.controller.ts` | `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **CERT-02-IDEM** | Cryptographic SHA-256 request payload hash validation and TTL expiration on idempotency keys (`AUD-CERT-02`), rejecting altered payload replays with 400 Bad Request | `apps/api/src/modules/certificates/issuance/certificate-issuance.service.ts` | `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **CERT-03-CRASH** | Zombie batch crash recovery allowing batches stuck in `PROCESSING` status following host crashes to be retried and pending items reset (`AUD-CERT-03`) | `apps/api/src/modules/certificates/batches/certificate-batch-processor.service.ts` | `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **PERF-01-MEM** | In-memory `RateLimiterService` sliding-window key eviction timer (`evictExpired`) with graceful `onModuleDestroy()` teardown (`AUD-PERF-01`), eliminating unbounded memory leaks | `apps/api/src/common/services/rate-limiter.service.ts` | `rate-limiter.service.spec.ts` | **VERIFIED** |
| **DATA-01-SYNC** | Concurrency and duplicate protection for offline attendance sync operations (`AUD-DATA-01`), eliminating crashes on `session_subject_unique` and cleanly reporting conflicts | `apps/api/src/modules/attendance/attendance.service.ts` | `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **CI-01-GATES** | GitHub Actions CI pipeline hardening executing complete E2E test suites, PostgreSQL venue exclusion constraints, and critical dependency audits (`AUD-CI-01`) | `.github/workflows/ci.yml`, `package.json` | `scripts/validation/test-venue-exclusion.ts`, `npm run audit:deps` | **VERIFIED** |
| **PRIV-01-RET** | Automated multi-entity retention purging and guest data anonymization service (`RetentionService`) executed via manual or scheduled triggers (`AUD-PRIV-01`), clearing expired sessions, tokens, idempotency records, and anonymizing concluded guest PII older than 90 days | `apps/api/src/modules/maintenance/retention.service.ts`, `maintenance.controller.ts` | `retention.service.spec.ts`, `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **PRIV-02-CONS** | Explicit student photograph consent tracking (`User.photoConsent` / `photo_consent`) with dedicated `PATCH /api/users/:id/photo-consent` toggle and serialization gating (`photo: u.photoConsent ? u.photo : null`), preventing unconsented photo dissemination | `apps/api/src/modules/users/users.service.ts`, `users.controller.ts`, `@csi/shared` | `users.service.spec.ts`, `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **PRIV-03-IP** | Rolling 90-day presentation anonymization of IP addresses in audit logs (`[ANONYMIZED]`) preserving PostgreSQL trigger-enforced ledger immutability (`PRIV-06`) | `apps/api/src/modules/audit-logs/audit-logs.service.ts` | `audit-logs.service.spec.ts`, `security-hardening.e2e-spec.ts` | **VERIFIED** |
| **SEC-DEP-01** | Bounded request parsing defense-in-depth mitigations against Zod advisory `GHSA-mrhx-c7xc-m3w5` (1 MB body limit, 10 MB multipart cap, schema string limits) (`AUD-DEP-01`) | `apps/api/src/main.ts`, `@csi/shared` | `npm run audit:deps`, code review | **VERIFIED** |
| **SEC-PKI-01** | Cryptographic digital signature vs SHA-256 tamper-evident integrity boundary formal disposition (`M14-AUD-01`), documenting institutional PKI dependencies under Indian IT Act 2000 | `apps/api/src/modules/passports/services/passport-pdf.service.ts`, `docs/M18_PRODUCTION_READINESS_REPORT.md` | Audit verification & report disposition | **VERIFIED** |

### Module M19: Backup Drills, Runbook & Maintainer Handover

| Requirement ID | Description | Implementing Component | Automated Test Suite / Verification | Status |
|---|---|---|---|:---:|
| **OPS-01-BCK** | Automated native PostgreSQL custom format (`-Fc`) backup generation with Table of Contents validation, record counts, and signed SHA-256 `manifest.json` | `scripts/database/backup.ts` | `backup-and-restore.spec.ts` (11/11 tests), backup execution | **VERIFIED** |
| **OPS-02-RET** | Jailed backup retention policy enforcement safely retaining $N$ recent backups and safely removing older dumps, storage archives, and manifests | `scripts/database/backup.ts` | `backup-and-restore.spec.ts` | **VERIFIED** |
| **OPS-03-STR** | Companion active file storage packaging (`.storage.tar.gz`) archiving certificates, passports, and media assets with SHA-256 verification | `scripts/database/backup.ts` | `backup-and-restore.spec.ts`, backup execution | **VERIFIED** |
| **OPS-04-DRL** | Automated disaster recovery restore drill subsystem with manifest checking, checksum matching, TOC parsing, and timestamped markdown report generation | `scripts/database/restore-drill.ts` | `backup-and-restore.spec.ts`, drill execution | **VERIFIED** |
| **OPS-05-SAF** | Critical database safety guards inspecting target table counts, refusing to overwrite active populated databases, and disabling destructive commands (`DROP DATABASE`, `TRUNCATE`, cascade resets) | `scripts/database/restore-drill.ts` | `backup-and-restore.spec.ts`, live refusal on `csi_gcet_test` | **VERIFIED** |
| **OPS-06-RNB** | Comprehensive Operations Runbook for student maintainers covering environment, setup, maintenance, deployments, recovery, and troubleshooting | `docs/OPERATIONS_RUNBOOK.md` | Runbook inspection & review | **VERIFIED** |
| **OPS-07-HND** | Formal Maintainer Handover Manual detailing domain lifecycles, RBAC, credentials, institutional escalation, and ownership transfer protocols | `docs/MAINTAINER_HANDOVER.md` | Handover manual inspection & review | **VERIFIED** |
| **OPS-08-CI** | Continuous integration validation running backup and disaster recovery tooling against native PostgreSQL on GitHub Actions | `.github/workflows/ci.yml`, `package.json` | CI workflow step & npm scripts (`npm run backup`, `npm run restore:drill`) | **VERIFIED** |









