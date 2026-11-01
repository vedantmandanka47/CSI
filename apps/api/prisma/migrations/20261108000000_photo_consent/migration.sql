-- Module M18: Photo Consent Tracking (DPDP Privacy & Polish)
-- Add photo_consent boolean flag to users table with default false
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photo_consent" BOOLEAN NOT NULL DEFAULT false;

