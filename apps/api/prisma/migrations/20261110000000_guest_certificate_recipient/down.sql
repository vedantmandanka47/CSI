-- Down Migration: 20261110000000_guest_certificate_recipient
ALTER TABLE "certificates" DROP CONSTRAINT IF EXISTS "certificates_guest_recipient_id_fkey";
DROP INDEX IF EXISTS "certificates_guest_recipient_id_idx";
ALTER TABLE "certificates" DROP COLUMN IF EXISTS "guest_recipient_id";

