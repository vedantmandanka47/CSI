-- Migration: 20261110000000_guest_certificate_recipient
-- TASK-012 / B06 / F21: Resolve Guest Certificate Recipient Foreign Key Violation
-- Adds guest_recipient_id column to certificates table referencing event_guests(id)

ALTER TABLE "certificates" ADD COLUMN IF NOT EXISTS "guest_recipient_id" UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'certificates_guest_recipient_id_fkey'
    ) THEN
        ALTER TABLE "certificates"
        ADD CONSTRAINT "certificates_guest_recipient_id_fkey"
        FOREIGN KEY ("guest_recipient_id")
        REFERENCES "event_guests"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "certificates_guest_recipient_id_idx" ON "certificates"("guest_recipient_id");

