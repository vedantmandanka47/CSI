-- DropForeignKey
ALTER TABLE IF EXISTS "passports" DROP CONSTRAINT IF EXISTS "passports_revoked_by_id_fkey";
ALTER TABLE IF EXISTS "passports" DROP CONSTRAINT IF EXISTS "passports_user_id_fkey";

-- DropIndexes
DROP INDEX IF EXISTS "passports_revoked_by_id_idx";
DROP INDEX IF EXISTS "passports_status_idx";
DROP INDEX IF EXISTS "passports_user_id_generated_at_idx";
DROP INDEX IF EXISTS "passports_verification_code_hash_key";
DROP INDEX IF EXISTS "passports_passport_number_key";

-- DropTable
DROP TABLE IF EXISTS "passports";

