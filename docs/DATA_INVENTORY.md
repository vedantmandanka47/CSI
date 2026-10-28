# Data Inventory & Retention Policy

This document registers every personal data field stored, processed, or transmitted by the CSI GCET SB platform, citing its explicit purpose, retention classification, and access restrictions (PRIV-05, PRIV-06, PRIV-12).

---

## 1. Personal Data Inventory

| Field | Purpose | Legal Basis / Purpose Justification | Retention Class | Access Restriction |
|---|---|---|---|---|
| `users.email` | Authentication, password reset, event reminders, official notices | Essential for service delivery & authentication | Active membership + 1 academic rollover year | Self, Admin, President/VP |
| `users.full_name` | Member identification, event rosters, certificate generation | Legitimate branch operational interest | Active membership + 3 academic years (for certificate verification) | Self, Committee, Admin |
| `users.enrollment_no` | GCET institutional verification (student validity check) | Institutional affiliation & eligibility | Active student term at GCET | Self, Faculty Sponsor, Admin |
| `users.phone` | Urgent event coordination & WhatsApp/SMS alerts | Explicit member consent | Active academic year (cleared on term rollover) | Self, Event Coordinator, Admin |
| `users.password_hash` | Cryptographic authentication credential (Argon2id) | Security credential | Overwritten immediately on password reset / account deletion | Application internal only (never logged, never exposed) |
| `attendance.timestamp` | Proof of physical/virtual participation at branch events | Performance of event contract & certificate eligibility | Retained with event history for academic reporting (3 years) | Self, Committee Coordinator, Admin |
| `attendance.verified_by` | Auditability of attendance check-in coordinator | Accountability and anti-fraud | Retained with attendance record | Admin, President/VP |
| `audit_log.ip` | Detection of brute force, credential stuffing, and session hijacking | Security defense & incident response (CERT-In / SEC-24) | Rolling 90 days `[ASK] Q21` | Admin (`audit.view` only) |
| `audit_log.actor_id` | Accountability for privileged administrative mutations | Security integrity & auditability | Permanent append-only ledger | Admin (`audit.view` only) |

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
