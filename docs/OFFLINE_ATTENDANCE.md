# Offline Attendance Protocol & Cryptographic Token Lifecycle (TASK-023 / B18 / F08)

## Overview

The CSI GCET Student Branch Management Platform supports high-reliability event check-ins under offline and degraded network conditions (e.g., campus auditoriums, labs, or workshops with saturated cellular or Wi-Fi connectivity).

This document specifies the cryptographic token lifecycle, client-side pre-flight checks, trusted capture timestamps, and server-side reconciliation rules governing offline check-in workflows.

---

## 1. Token Cryptographic Architecture

### 1.1 Dynamic QR Pass Structure
Member ID card QR passes are digitally signed tokens formatted as:
```
csi_pass.<base64url_encoded_payload>.<base64url_encoded_ed25519_signature>
```

#### Token Payload:
```json
{
  "sub": "00000000-0000-0000-0000-000000000001",
  "eno": "23CS101",
  "nam": "Jane Doe",
  "rol": ["member"],
  "iat": 1794000000,
  "exp": 1794000060,
  "jti": "d3b07384-d113-469b-98f2-30ff4cf4815a"
}
```

- **Asymmetric Signature:** Issued exclusively by the CSI GCET backend using an Ed25519 private key (`QR_SIGNING_PRIVATE_KEY`). Verified using the public key (`QR_SIGNING_PUBLIC_KEY`).
- **Rotation Period:** 60-second validity window (`exp = iat + 60`).
- **Anti-Tampering:** Any modification to `sub`, `iat`, `exp`, or `jti` invalidates the Ed25519 cryptographic signature.

---

## 2. The Offline Verification Problem & Paradox

When volunteer workstations run the scanner application (`/scanner`) without an active internet connection:
1. The volunteer's device scans an attendee's dynamic QR pass.
2. The check-in is buffered in browser IndexedDB (`csi_offline_attendance`) with the local capture timestamp: `client_marked_at: ISO8601`.
3. Hours later (or after the event concludes), the workstation connects to the network and submits the batch to `POST /api/attendance/sync`.
4. **The Paradox (Resolved):** In standard online mode, tokens older than 60 seconds fail validation (`now > exp`). If evaluated against server wall-clock time at sync reconciliation, 100% of legitimate offline check-ins would fail.

---

## 3. Trusted Capture Time Protocol

To reconcile offline check-ins securely without allowing replay attacks or screenshot abuse:

### 3.1 Verification Rules at Sync Reconciliation
When `syncOfflineOperations` processes a queued operation (`AttendanceMethod.QR_SCAN`), it invokes `IdCardService.verifyQrPass` with the client capture timestamp:
```typescript
await this.idCardService.verifyQrPass(op.payload, {
  captureTimestamp: clientMarkedAt,
  maxSyncWindowSec: 86400, // 24 hours
  clockSkewToleranceSec: 30, // 30 seconds
});
```

The server performs the following strict cryptographic and temporal assertions:

1. **Ed25519 Cryptographic Authenticity:**
   The digital signature must match the unforgeable Ed25519 public key. If altered:
   `Cryptographic signature mismatch. Pass has been altered or forged.`

2. **Future Timestamp Protection:**
   The scanner device cannot claim a scan took place in the future:
   `captureSec <= nowSec + clockSkewSec (30s)`.
   If violated: `Capture timestamp cannot be in the future.`

3. **Maximum Offline Sync Retention Window:**
   Reconciliation must occur within 24 hours of capture:
   `nowSec - captureSec <= 86400`.
   If violated: `Captured QR pass exceeds maximum offline sync retention window (24 hours).`

4. **Token Issuance Order:**
   The capture timestamp cannot predate the issuance of the token:
   `captureSec >= payload.iat - clockSkewSec (30s)`.
   If violated: `QR pass capture timestamp predates token issuance.`

5. **Token Expiration at Capture Time:**
   The pass must have been active at the moment the scan took place:
   `captureSec <= payload.exp + clockSkewSec (30s)`.
   If violated: `QR pass was expired at capture time.`

6. **Active Member Standing:**
   The member identified in `payload.sub` must exist and hold `status: UserStatus.ACTIVE`.

---

## 4. Multi-Layer Defenses Against Abuse

| Threat Vector | Defense Mechanism | Result |
| :--- | :--- | :--- |
| **Old Screenshot Presented to Volunteer** | Client-side preflight in `enqueueOfflineOperation` decodes `payload.exp`. If `nowSec > exp + 30`, refuses to enqueue. | Immediate rejection on volunteer's screen (`QR pass is already expired.`). |
| **Bypassing Client Pre-flight (Direct IndexedDB Injection)** | Server `verifyQrPass` compares `captureSec` with `payload.exp + 30`. | Server marks operation `REJECTED`: `QR pass was expired at capture time.` |
| **Forged Payload Timestamps (`iat`/`exp`)** | Server validates Ed25519 digital signature. Payload tampering breaks signature. | Server marks operation `REJECTED`: `Cryptographic signature mismatch.` |
| **Multiple Scans of the Same Attendee** | Server database enforces unique constraint `session_subject_unique: (sessionId, subjectType, subjectId)`. Duplicate check runs prior to validation. | Server marks second scan `FLAGGED_CONFLICT`: `Duplicate check-in detected during offline sync reconciliation.` |
| **Replay After 24 Hours** | Server enforces `maxSyncWindowSec: 86400`. | Server marks operation `REJECTED`: `Captured QR pass exceeds maximum offline sync retention window (24 hours).` |
| **Scanning for Wrong Session or Closed Session** | Centralized `validateSessionBounds` verifies `session.isOpen` and session schedule `[startsAt, endsAt + gracePeriod]`. | Server marks operation `REJECTED`: `Attendance session is currently closed.` or `Attendance session has ended.` |

---

## 5. Offline Attendance Methods Supported

1. **`QR_SCAN`:** Dynamic rotating membership QR passes verified via Ed25519 and trusted capture timestamp bounds.
2. **`ROTATING_CODE`:** TOTP attendance codes verified via session TOTP secret across client-recorded time-step windows.
3. **`MANUAL`:** Offline manual check-in by member ID/enrollment number, requiring non-empty verification notes (minimum 3 characters) explaining the manual check-in rationale.

