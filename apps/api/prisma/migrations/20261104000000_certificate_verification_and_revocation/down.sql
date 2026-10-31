-- DropForeignKey
ALTER TABLE "certificates" DROP CONSTRAINT IF EXISTS "certificates_revoked_by_id_fkey";

-- DropIndexes
DROP INDEX IF EXISTS "certificates_revoked_by_id_idx";
DROP INDEX IF EXISTS "certificates_status_idx";
DROP INDEX IF EXISTS "certificates_verification_code_hash_key";

-- DropColumns
ALTER TABLE "certificates"
    DROP COLUMN IF EXISTS "revoked_by_id",
    DROP COLUMN IF EXISTS "revocation_reason",
    DROP COLUMN IF EXISTS "revoked_at",
    DROP COLUMN IF EXISTS "verification_code_hash";
