# M18 DPDP Privacy Audit Report
## CSI GCET Student Branch Web Platform
**Audit Stage:** Module M18: Production Hardening & DPDP Privacy Audit  
**Target Repository:** `CSI GCET Student Branch Platform (CSI-main)`  
**Branch:** `main`  
**Governing Statute:** The Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023, India)  
**Institutional Fiduciary Context:** G H Patel College of Engineering & Technology (GCET) / Charutar Vidyamandal University (CVMU)  
**Status:** **TECHNICAL PRIVACY CONTROLS VERIFIED**

---

> [!IMPORTANT]
> **Legal Disclaimer:** This report evaluates the technical, architectural, and data engineering controls implemented within the CSI GCET Student Branch software repository. It does not constitute formal legal advice, an official institutional legal certification, or a guarantee of compliance. Legal certification requires formal administrative review by GCET / CVMU legal counsel and appointed institutional Data Protection Officers.

---

## 1. Statutory Context & Commencement Assessment

The Digital Personal Data Protection Act, 2023 (DPDP Act) was published in the Gazette of India on August 11, 2023. As of the audit date, the platform evaluates its controls against:

1. **Substantive Core Provisions (Sections 4–9):** Grounds for processing personal data, consent requirements, notice obligations, and duties of Data Fiduciaries.
2. **Data Principal Rights (Sections 11–14):** Rights to access information, correction, erasure, and grievance redressal.
3. **Pending Central Rules:** Specific implementation guidelines (e.g., standard notice formats, Data Protection Board procedures, parental consent verification workflows) remain subject to subordinate rule notification by the Ministry of Electronics and Information Technology (MeitY).

The platform enforces **privacy-by-design** and **data minimization** proactively rather than awaiting final rule promulgation.

---

## 2. Personal Data Inventory & Processing Classification

| Personal Data Field | Purpose of Processing | Legal Basis | Access Restriction | Retention Schedule | Deletion / Anonymization Mechanism |
|:---|:---|:---|:---|:---|:---|
| `users.email` | Authentication, official chapter notices, credential delivery | Performance of membership contract | Self, Chapter Executives, Admin | Active student enrollment + 1 rollover term | Account deactivation or administrative purge |
| `users.name` | Identity verification, event rosters, certificate issuance | Legitimate branch operational interest | Public (on verified credentials), Self, Admin | Permanent academic archive for certificates | Retained with verifiable credentials |
| `users.enrollment_no` | Institutional verification with GCET academic roster | Institutional affiliation verification | Self, Faculty Counselor, Admin | Active academic tenure at GCET | Cleared on term rollover if inactive |
| `users.phone` | Urgent event dispatch and check-in assistance | Explicit member consent | Self, Event Coordinators, Admin | Active academic term | Cleared upon term rollover (`M17`) |
| `users.photo` | Visual verification on digital ID pass | Dedicated explicit photo consent | Self, Volunteer Scanners (with consent) | Active membership | Suppressed if `photo_consent == false` |
| `users.photo_consent` | Consent record for photograph processing & display | Explicit Data Principal consent | Self, System Admin | Active membership | Toggleable by member via `/photo-consent` |
| `event_guests.name` | Guest entry badge & seat allocation | Explicit event consent | Event Coordinators, Admin | Event duration + 90 days | Anonymized to `"Anonymized Guest"` via `RetentionService` |
| `event_guests.email` | Event confirmations & attendance QR pass | Explicit event consent | Event Coordinators, Admin | Event duration + 90 days | Anonymized to `anonymized-<id>@anonymized.local` |
| `event_guests.phone` | Emergency event logistics communication | Explicit event consent | Event Coordinators, Admin | Event duration + 90 days | Wiped to `"0000000000"` via `RetentionService` |
| `event_guests.consent_at` | Proof of consent given at registration | Legal accountability (DPDP Sec 6) | Admin (`audit.view`) | Permanent audit trail | Preserved timestamp of original consent |
| `attendance.timestamp` | Proof of workshop/hackathon participation | Certificate eligibility & verification | Self, Committee Leads, Admin | Event history + 3 academic years | Archived with event records |
| `audit_log.ip` | Abuse detection, credential stuffing defense | Security defense (CERT-In / SEC-24) | Admin (`audit.view` only) | Rolling 90 days | Masked to `"[ANONYMIZED]"` on reads > 90d |

---

## 3. Purpose Limitation & Data Minimization Audit

### A. Dedicated Photo Consent Gating (PE.md M18)
- Prior to M18, member photographs were stored in `users.photo` without a dedicated consent tracking flag.
- Under M18, database schema migration `20261108000000_photo_consent` introduced `photo_consent: BOOLEAN NOT NULL DEFAULT false`.
- **Enforcement:** `UsersService.findAll` and `UsersService.findById` evaluate `user.photoConsent`. If `photoConsent === false`, `photo` is omitted and returned as `null` to all public and directory consumers.
- **Data Principal Control:** Members can grant or revoke consent via `PATCH /api/users/:id/photo-consent`.

### B. Public Verification Data Minimization
- The public credential verification routes (`GET /api/verify/:code`, `GET /api/certificates/verify/:code`, `GET /api/passports/verify/:code`):
  - **Expose:** Recipient full name, event title, credential issue date, credential status, verified activity counts.
  - **Redact & Suppress:** Email addresses, phone numbers, GCET institutional enrollment numbers, internal storage paths, and private database IDs.

### C. Workspace Isolation & Privilege Boundaries
- Committee workspace rosters expose only active committee members (name, branch email, role title, active term). Personal student telephone numbers and residential details are stripped.

---

## 4. Notice and Consent Mechanisms

### A. Guest Attendee Consent
- Non-member guest registration (`POST /api/events/:id/guests`) enforces `GuestRegisterSchema`.
- The field `consent_data_processing: z.literal(true)` is strictly mandatory. If the user submits `false` or omits the parameter, the request is rejected with HTTP 400: `"Consent to data processing is required"`.
- When valid, the database records the exact millisecond timestamp in `event_guests.consent_at`.

### B. Member Registration Consent
- Student member registration requires college email validation (`@gcet.ac.in`), ensuring institutional affiliation.
- Membership application notices explain that name, enrollment number, and attendance will be processed exclusively for CSI GCET branch operations and certificate issuance.

---

## 5. Data Principal Rights Implementation

1. **Right to Access Information (Section 11):**
   - Members can query their complete active profile and role assignments via `GET /api/auth/me`.
   - Members can inspect their digital ID card data via `GET /api/me/id-card`.
   - Members can retrieve their consolidated extracurricular dossier via `GET /api/passports/me`.
2. **Right to Correction and Updating (Section 12):**
   - Academic details (branch, year) and status can be updated through chapter administrative reviews (`/api/users/:id/status`).
   - Photo consent flags can be toggled by the member at any time (`PATCH /api/users/:id/photo-consent`).
3. **Right to Erasure / Anonymization (Section 12):**
   - Implemented via `RetentionService.anonymizeConcludedEventGuests()`. Guest records for events concluded more than 90 days prior are automatically stripped of identifiable attributes (`name`, `email`, `phone`, `college`).
4. **Right to Grievance Redressal (Section 13):**
   - The platform footer and `/about` pages identify the Chapter Counselor (Department of Computer Engineering, GCET) as the primary escalation point for data privacy grievances.

---

## 6. Retention & Erasure Automation (`AUD-PRIV-01`)

Under DPDP Act Section 8(7), personal data must be erased as soon as the purpose for which it was collected has been achieved and retention is no longer necessary for legal or business purposes.

### Automated Retention Service (`RetentionService`)
The platform introduces a dedicated `RetentionService` providing automated and administrative cleanup:
- **`purgeExpiredSessions()`:** Deletes rows from `sessions` where `expiresAt < now()`.
- **`purgeExpiredTokens()`:** Deletes rows from `verification_tokens` and `password_reset_tokens` where `expiresAt < now()`.
- **`purgeExpiredIdempotencyKeys()`:** Deletes cached idempotency responses from `idempotency_keys` where `expiresAt < now()`.
- **`anonymizeConcludedEventGuests()`:** Anonymizes guest attendee PII for concluded events older than the retention threshold (default 90 days).
- **`runRetentionPurge()`:** Aggregates all cleanup tasks, records an immutable entry in `audit_log` (`action: RETENTION_PURGE_EXECUTED`), and reports counts.
- **Trigger Endpoint:** `POST /api/admin/maintenance/retention-purge` guarded by `ROSTER_MANAGE` permission and rate-limited.

---

## 7. Third-Party Data Processing Assessment

| Third-Party Processor | Category of Data Shared | Processing Purpose | Location | Contractual / Security Dependency |
|:---|:---|:---|:---|:---|
| **Local PostgreSQL** | All platform models | Primary relational database | On-Premises Host | Guarded by OS permissions & non-root user (`csi_app`) |
| **Local File Storage** | Certificate PDFs, Passport PDFs, Posters | Media & Document Storage | On-Premises Host | Path-jailed in `STORAGE_ROOT_DIR`, private URLs blocked |
| **Transactional Email (Resend / SMTP)** | Recipient email, name, verification link | Password reset & email verification | Cloud / Institutional SMTP | API keys strictly managed via `env.ts`; credentials never logged |

---

## 8. Privacy Audit Summary & Institutional Dependencies

| DPDP Area | Technical Implementation Status | Verification Status | Outstanding Institutional Dependency |
|:---|:---:|:---:|:---|
| **Data Minimization** | `photo_consent` gating, minimal verification projection | **PASS** | None |
| **Notice & Consent** | Mandatory guest checkbox, timestamp tracking | **PASS** | Formal GCET privacy notice legal review |
| **Data Principal Rights** | Self-service profile, passport export, consent toggle | **PASS** | Institutional Grievance Redressal Committee setup |
| **Retention & Erasure** | `RetentionService` automated TTL purge & guest anonymization | **PASS** | Cron scheduler daemon configuration (`M19`) |
| **Audit Ledger Privacy** | 90-day presentation IP masking (`PRIV-06`) | **PASS** | None |

