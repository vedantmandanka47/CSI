# Data Inventory & Retention Policy

This document registers every personal data field stored, processed, or transmitted by the CSI GCET SB platform, citing its explicit purpose, retention classification, and access restrictions (PRIV-05, PRIV-06, PRIV-12).

---

## 1. Personal Data Inventory

| Field | Purpose | Legal Basis / Purpose Justification | Retention Class | Access Restriction |
|---|---|---|---|---|
| `users.email` | Authentication, password reset, event reminders, official notices | Essential for service delivery & authentication | Active membership + 1 academic rollover year | Self, Admin, President/VP |
| `users.full_name` | Member identification, event rosters, certificate generation | Legitimate branch operational interest | Active membership + 3 academic years (for certificate verification) | Self, Committee, Admin |
| `users.enrollment_no` | GCET institutional verification (student validity check) | Institutional affiliation & eligibility | Active student term at GCET | Self, Faculty Sponsor, Admin |
| `users.photo_consent` | Explicit consent flag for branch event photography and publication | DPDP Act 2023 technical consent record | Retained with user profile; user modifiable | Self, Admin (`roster.manage`) |
| `users.phone` | Urgent event coordination & WhatsApp/SMS alerts | Explicit member consent | Active academic year (cleared on term rollover) | Self, Event Coordinator, Admin |
| `users.password_hash` | Cryptographic authentication credential (Argon2id) | Security credential | Overwritten immediately on password reset / account deletion | Application internal only (never logged, never exposed) |
| `attendance_sessions.totp_secret` | Rotating QR check-in seed encrypted at rest with AES-256-GCM | Event check-in security credential | Retained with session; encrypted at rest (`AUD-SEC-04`) | Application internal only (never exposed) |
| `event_guests.name` | Guest event registration identification | Performance of event registration contract | Concluded event + 90 days; then anonymized to `[ANONYMIZED]` | Self, Coordinator, Admin |
| `event_guests.email` | Guest ticket confirmation & event notices | Delivery of registration receipt | Concluded event + 90 days; then anonymized to `anonymized_<id>@redacted.local` | Self, Coordinator, Admin |
| `event_guests.phone` | Urgent event notices & coordination | Explicit attendee consent | Concluded event + 90 days; then nulled | Self, Coordinator, Admin |
| `attendance.timestamp` | Proof of physical/virtual participation at branch events | Performance of event contract & certificate eligibility | Retained with event history for academic reporting (3 years) | Self, Committee Coordinator, Admin |
| `attendance.verified_by` | Auditability of attendance check-in coordinator | Accountability and anti-fraud | Retained with attendance record | Admin, President/VP |
| `audit_log.ip` | Detection of brute force, credential stuffing, and session hijacking | Security defense & incident response (CERT-In / SEC-24) | Rolling 90 days `[ASK] Q21` | Admin (`audit.view` only) |
| `audit_log.actor_id` | Accountability for privileged administrative mutations | Security integrity & auditability | Permanent append-only ledger | Admin (`audit.view` only) |
| `passports.user_id` | Reference to student recipient for dossier compilation | Essential for activity passport generation | Retained during active student enrollment + 3 academic years | Self, Admin (`export.data`) |
| `passports.passport_number` | Unique identifier for placement and academic credentialing | Legitimate educational and career credentialing | Retained with passport record | Self, Admin, Public Verification |
| `passports.verification_code_hash` | SHA-256 hash of Crockford Base32 verification code | Cryptographic anti-forgery validation | Retained with passport record | Application internal only (never exposed) |
| `passports.summary_json` | Immutable JSON snapshot containing aggregate metrics (`counts`) and itemized activity records (`activities`: id, type, title, category, date, verificationStatus) frozen at the time of export | Verifiable record of extracurricular contributions | Retained with passport record | Self, Admin, Public Verification (counts and non-sensitive fields only) |
| `passports.file_hash` | Cryptographic SHA-256 checksum of generated PDF | Tamper detection and dossier integrity verification | Retained with passport record | Application internal only |
| `tasks.assigned_to_id` | Member ID assigned to committee operational task | Operational task management & responsibility | Active committee term + 1 rollover year | Self, Committee, Executive leadership |
| `tasks.created_by_id` | Member ID who authored the task | Auditability and task ownership | Active committee term + 1 rollover year | Self, Committee, Executive leadership |
| `checklist_items.completed_by_id` | Member ID who checked off a pre-event task | Operational accountability and drill execution | Active academic term + 1 rollover year | Self, Committee, Executive leadership |
| `checklist_runs.signed_off_by_id` | Committee lead or executive who verified the run | Verified leadership sign-off & accountability | Retained with event history (3 years) | Committee, Executive leadership, Admin |
| `committee_assets.uploaded_by_id` | Member ID who uploaded promotional/media asset | Attribution and review workflow | Retained with event history (3 years) | Committee, Executive leadership, Admin |
| `committee_assets.reviewed_by_id` | Committee lead or executive who approved/rejected asset | Review accountability and publishing governance | Retained with event history (3 years) | Committee, Executive leadership, Admin |
| `committee_assets.file_hash` | Cryptographic SHA-256 checksum of media file | Binary tamper detection & storage integrity | Retained with asset record | Application internal only |
| `academic_terms.created_by_id` | Administrator ID who created the academic term | Operational term management accountability | Permanent academic history | Admin, Executive leadership |
| `term_snapshots.captured_by_id` | Administrator or executive ID who captured snapshot | Auditability of frozen term archive | Permanent historical archive | Admin, Executive leadership |
| `term_snapshots.snapshot_json` | Immutable JSON freezing closing metrics and roster | Preserving verifiable historical branch achievements | Permanent historical archive | Admin, Executive leadership |
| `term_rollovers.executed_by_id` | Executive user ID who authorized the transition | Governance accountability and auditability | Permanent historical ledger | Admin, Executive leadership |
| `term_rollovers.summary_json` | Rollover transaction execution metrics | Audit trail of transitioned roles and workflows | Permanent historical ledger | Admin, Executive leadership |

---

## 2. Prohibited Data Categories (Strictly Forbidden)

In adherence to Hard Rule 20 and PRIV-05, the following data categories are **strictly prohibited** from collection or storage in this platform:

1. **National Identity Numbers:** No Aadhaar numbers, PAN cards, or passport numbers.
2. **Financial Data:** No bank account details, UPI IDs, credit/debit card numbers, or transaction receipts (all payments, if any, handled out-of-band or via institutional college cash receipts).
3. **Sensitive Personal Data:** No biometric information, medical/health data, caste, religion, or political beliefs.
4. **Minors / Under 18 Data:** No participant under 18 years of age without explicit guardian verification (`[ASK] Q9, PRIV-09`).
5. **Date of Birth:** Not collected unless explicitly requested and approved by faculty sponsor with documented necessity.

---

## 3. Data Minimization & Privacy Rules

- **Redaction in Application Logs (SEC-24):** All passwords, session tokens, CSRF tokens, authorization headers, phone numbers, and email addresses are automatically masked or redacted before reaching pino logger outputs.
- **Audit Minimization (PRIV-12):** `audit_log.before_json` and `after_json` never store raw passwords, password hashes, or token secrets.
- **Certificate Verification (PRIV-10):** Public verification pages (`/verify/:id`) display only the certificate recipient's name, event title, and issue date. Private contact details (email, phone, enrollment number) are never exposed on public URLs.
- **Activity Passport Verification (PRIV-14):** Public passport verification endpoints (`/passports/verify/:code` and `/verify/:code`) display strictly verified participation counts, student full name, passport number, and issuance date. Student contact information (email, phone), institutional enrollment numbers, and internal database/storage paths are redacted and never returned.
- **Committee Workspace Access Minimization (PRIV-15):** Committee workspaces expose only active member rosters (name, email, role, term) and branch events. Private profile details (phone numbers, passwords, hashes, internal storage paths) are not exposed to committee members. Workspace access events are logged in the append-only `audit_log` (`workspace.accessed`).
- **Operational Task & Asset Minimization (PRIV-16):** Task descriptions, checklists, and asset metadata are restricted to active committee members and executive leadership. Files uploaded to the media repository are sanitized, path-jailed on disk, and verified via SHA-256 without exposing underlying host directory layouts to clients. All modifications are tracked in the append-only `audit_log`.
- **Annual Term Rollover & Archival Minimization (PRIV-17):** Historical term snapshots freeze closing roster appointments (name, email, role, committee) and operational metrics at the instant of term archival. Sensitive personal attributes (passwords, phone numbers, enrollment numbers, personal identifiers) are omitted from snapshots. Rollover execution records are immutable and queryable strictly by authorized branch executives (`ROSTER_MANAGE`).
- **Photo Consent Gating (PRIV-18 / DPDP Act 2023):** Photographs of members are gated strictly behind explicit consent (`users.photo_consent`). When consent is false, photograph URLs are serialized as `null` on public rosters, committee views, and member listings. Members can modify their consent setting via `PATCH /api/users/:id/photo-consent`.
- **Rolling IP Presentation Anonymization (PRIV-06 / DPDP):** In order to comply with the 90-day retention ceiling for IP addresses while preserving the forensic immutability of the PostgreSQL `audit_log` table (protected by trigger against `UPDATE` and `DELETE`), IP addresses older than 90 days are dynamically masked as `[ANONYMIZED]` on service read (`AuditLogsService.findAll`).
- **Automated Retention Purging (PRIV-01 / DPDP):** The automated `RetentionService` purges expired sessions, email verification tokens, password reset tokens, and idempotency keys past their TTL. In addition, guest records for events concluded more than 90 days ago are automatically anonymized (`name = '[ANONYMIZED]'`, `email = 'anonymized_<id>@redacted.local'`, `phone = null`), logging every execution under audit action `RETENTION_PURGE_EXECUTED`.
- **Backup Data Protection & Retention (PRIV-19 / M19):** Backup archives (`storage/backups/*.dump` and companion `.storage.tar.gz`) contain full database snapshots and media assets. Access is restricted to system administrators with OS-level file permissions. Backup directories are gitignored to prevent accidental public repository disclosure. Retention management (`enforceRetention`) automatically purges expired backup sets older than the configured threshold (default: 7) using path-jailed deletion checks.



