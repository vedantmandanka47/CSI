# Third-Party Processors and Vendors Registry

This registry records every external vendor, cloud infrastructure provider, third-party service, and API integration utilized by the CSI GCET SB Web Platform (PRIV-08, PRIV-15).

---

## 1. Active Infrastructure and Hosting Services

| Vendor / Service | Purpose | Data Transferred | Processing Region | Security & Safeguards | Authorization Status |
|---|---|---|---|---|---|
| **Local Host Infrastructure** | Database and backend compute runtime | Application data, PostgreSQL tables | Local Server (GCET Campus / Local Dev) | Native OS-level permissions, encrypted connections | Approved `[DECIDED]` |
| **GitHub Actions** | Automated CI quality gates, linting, tests, build verification | Synthetic test fixtures and code only (zero production member data) | GitHub Cloud Runners | Secret scanning (Gitleaks), least-privilege tokens (`contents: read`) | Approved `[DECIDED]` |

---

## 2. Planned Production Service Integrations (Pending Confirmation)

| Service Candidate | Intended Purpose | Data Transferred | Privacy Safeguards | Status |
|---|---|---|---|---|
| **Transactional Email (SMTP / SES / SendGrid)** | Password reset, event confirmations, certificate delivery | Recipient email, member name, notification body | TLS in transit; dev writes to `./storage/dev-mail` | Pending hosting decision `[ASK] Q7` |
| **Object Storage (S3 / Cloudflare R2 / MinIO)** | Member ID photos, event posters, verified certificate PDFs | Media files, document assets | Pre-signed upload URLs; private assets blocked from public indexing (SEC-16) | Pending hosting decision `[ASK] Q7` |
| **Sentry (Error Tracking)** | Real-time crash diagnostics & unhandled exceptions | Stack traces, error codes (PII redacted via Pino redaction) | Sentry Data Scrubbing; `beforeSend` masks personal identifiers | Optional locally; pending `[ASK] Q7` |

---

## 3. Strictly Prohibited Third-Party Services (Hard Rule 22 & PRIV-08)

The following services are **strictly forbidden** from receiving student or branch data without prior institutional review and documented authorization:

1. **Public AI Services / LLM APIs:** No real student names, emails, phone numbers, or attendance records may be submitted to external AI tools or prompt completions.
2. **Third-Party Behavioral Trackers & Ad Networks:** No Google Analytics, Meta Pixel, or marketing tracking scripts.
3. **Third-Party CAPTCHAs that Profile Users:** No commercial CAPTCHAs that harvest browser fingerprinting data.
4. **Google Forms Bridge:** The automated Google Forms bridge (`GOOGLE_SERVICE_ACCOUNT_JSON_B64`) remains disabled by default until the Forms integration is officially reviewed and approved (`[ASK] Q22`).

