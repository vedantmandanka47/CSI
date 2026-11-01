-- CreateTable: passports
CREATE TABLE IF NOT EXISTS "passports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "passport_number" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "file_hash" VARCHAR(64),
    "file_size_bytes" INTEGER,
    "storage_path" VARCHAR(255),
    "verification_code_hash" VARCHAR(64) NOT NULL,
    "summary_json" JSONB,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" TEXT,
    "revoked_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on passport_number
CREATE UNIQUE INDEX IF NOT EXISTS "passports_passport_number_key" ON "passports"("passport_number");

-- CreateIndex: unique constraint on verification_code_hash
CREATE UNIQUE INDEX IF NOT EXISTS "passports_verification_code_hash_key" ON "passports"("verification_code_hash");

-- CreateIndex: index on (user_id, generated_at DESC)
CREATE INDEX IF NOT EXISTS "passports_user_id_generated_at_idx" ON "passports"("user_id", "generated_at" DESC);

-- CreateIndex: index on status
CREATE INDEX IF NOT EXISTS "passports_status_idx" ON "passports"("status");

-- CreateIndex: index on revoked_by_id
CREATE INDEX IF NOT EXISTS "passports_revoked_by_id_idx" ON "passports"("revoked_by_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'passports_user_id_fkey'
    ) THEN
        ALTER TABLE "passports"
            ADD CONSTRAINT "passports_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'passports_revoked_by_id_fkey'
    ) THEN
        ALTER TABLE "passports"
            ADD CONSTRAINT "passports_revoked_by_id_fkey"
            FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Role grants to runtime application role csi_app
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "passports" TO csi_app;
    END IF;
END $$;

