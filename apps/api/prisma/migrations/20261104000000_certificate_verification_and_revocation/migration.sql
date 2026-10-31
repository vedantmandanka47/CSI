-- AlterTable: Add verification and revocation fields to certificates
ALTER TABLE "certificates"
    ADD COLUMN IF NOT EXISTS "verification_code_hash" VARCHAR(64),
    ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT,
    ADD COLUMN IF NOT EXISTS "revoked_by_id" UUID;

-- CreateIndex: unique constraint on verification_code_hash
CREATE UNIQUE INDEX IF NOT EXISTS "certificates_verification_code_hash_key"
    ON "certificates"("verification_code_hash")
    WHERE "verification_code_hash" IS NOT NULL;

-- CreateIndex: index on status and revoked_by_id
CREATE INDEX IF NOT EXISTS "certificates_status_idx" ON "certificates"("status");
CREATE INDEX IF NOT EXISTS "certificates_revoked_by_id_idx" ON "certificates"("revoked_by_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'certificates_revoked_by_id_fkey'
    ) THEN
        ALTER TABLE "certificates"
            ADD CONSTRAINT "certificates_revoked_by_id_fkey"
            FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Role grants to runtime application role csi_app
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "certificate_batches", "certificates" TO csi_app;
    END IF;
END $$;
