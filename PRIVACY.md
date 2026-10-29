# Privacy Notice and Data Protection Record

This document sets forth the technical safeguards, factual disclosures, and data handling practices implemented for the Computer Society of India (CSI) GCET Student Branch web platform.

> **Notice Regarding Institutional Governance:**
> This document records engineering controls and technical safeguards. It does not constitute legal counsel or a formal compliance certification (PRIV-13). All institutional governance policies and grievance contact assignments are subject to review by the CSI GCET SB executive committee and faculty sponsor. Unresolved institutional parameters are explicitly marked `[ASK]` or `[CONTENT NEEDED]`.

---

## 1. Identity and Contact Information

- **Data Fiduciary:** Computer Society of India GCET Student Branch.
- **Affiliated Institution:** G H Patel College of Engineering & Technology (GCET), Vallabh Vidyanagar, Gujarat, India.
- **Faculty Sponsor / Branch Counselor:** `[CONTENT NEEDED: Name and institutional email of designated faculty sponsor]`
- **Student Branch Chair / President:** `[CONTENT NEEDED: Name and branch contact email]`
- **Grievance Redressal Point of Contact:** `[CONTENT NEEDED: Institutional email and designated grievance redressal mechanism]` `[ASK] Q19`

---

## 2. Personal Information Collected and Stored

The platform records the following personal information strictly for student branch operations:

1. **Member Identity:**
   - Full name
   - Institutional GCET enrollment number
   - Email address
   - Phone number (collected on an optional basis for event coordination)
2. **Account Security Credentials:**
   - Cryptographic password hashes (Argon2id)
   - Active session tokens
3. **Event Participation and Academic Credentials:**
   - Event registrations and waitlist timestamps
   - Attendance check-in timestamps and verification records
   - Issued certificate serial identifiers and verification statuses
4. **Security Audit Telemetry:**
   - Network IP address of administrative actions (`[ASK] Q21: 90-day retention schedule`)
   - Timestamps and identifiers of privileged data mutations in `audit_log`

### Prohibited Data Notice (Hard Rule 20)
This platform **does not collect or store**:
- National identification numbers (Aadhaar, PAN, Passport).
- Financial, banking, credit/debit card, or UPI transaction credentials.
- Biometric, medical, health, or sensitive personal data.

---

## 3. Purposes of Processing

Personal data is processed exclusively for the following operational objectives:
- Authenticating registered members and verifying active GCET student status.
- Facilitating registration, capacity management, and attendance check-in at branch workshops, seminars, and technical events.
- Generating and cryptographically verifying tamper-proof certificates of participation and merit.
- Delivering essential transactional notifications (password resets, event reminders, schedule adjustments).
- Maintaining an immutable security audit log of administrative activities for accountability.

---

## 4. Technical and Architectural Safeguards

The platform implements the following verified engineering controls:

- **Argon2id Password Hashing:** Passwords are never stored in plaintext or reversible formats; they are hashed using Argon2id with memory-hard parameters.
- **Append-Only Audit Ledger:** The PostgreSQL `audit_log` table enforces a database-level trigger (`audit_log_prevent_mutation`) that rejects any `UPDATE`, `DELETE`, or `TRUNCATE` operations.
- **Database Privilege Separation:** The runtime application connects under role `csi_app`, which possesses DML rights only and cannot alter the schema.
- **Automated PII Redaction:** Passwords, session tokens, authorization headers, phone numbers, and email addresses are automatically masked before application logs are written to disk.
- **Dynamic QR Attendance:** Digital ID cards and event attendance check-ins utilize Ed25519 digital signatures and rotating time steps (TOTP-like 30-second steps) to mitigate QR screenshot replay.
- **Transport Security:** All web traffic is transmitted over HTTPS/TLS with modern cipher suites and security headers (Helmet: HSTS, CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff).
- **No Third-Party Trackers:** No commercial advertising pixels, social network tracking beacons, or profiling cookies are embedded in the platform.

---

## 5. Member Rights and Data Access

Registered members possess the following rights regarding their records:
- **Right of Access:** Members may inspect their personal profile data and event attendance history through the member portal.
- **Right to Rectification:** Members may request corrections to inaccurate contact or enrollment details.
- **Right to Erasure / Deactivation:** Members may request account deactivation upon graduation or departure from the student branch (`[ASK] Q19: Administrative workflow and timeframe for deletion requests`).

---

## 6. Retention and Disposal Schedules

- **Active Membership Data:** Retained for the duration of the member's academic enrollment at GCET + 1 academic year rollover.
- **Certificate Verification Records:** Retained for 3 academic years to allow alumni and verification portals to validate certificates.
- **Audit Log Telemetry:** Rolling 90 days for client IP addresses; permanent immutable record for high-privilege administrative audit entries.
- **Disposal Procedure:** `[CONTENT NEEDED: Formal academic year rollover and data disposal procedure]` `[ASK] Q5`

