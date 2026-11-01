-- Module M17: Annual Term Rollover & Archival Migration
-- Creates academic_terms, term_snapshots, and term_rollovers tables

-- 1. Create academic_terms table
CREATE TABLE IF NOT EXISTS "academic_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id")
);

-- Unique index on code
CREATE UNIQUE INDEX IF NOT EXISTS "academic_terms_code_key" ON "academic_terms"("code");

-- Filtering and boundary indexes
CREATE INDEX IF NOT EXISTS "academic_terms_is_current_idx" ON "academic_terms"("is_current");
CREATE INDEX IF NOT EXISTS "academic_terms_status_idx" ON "academic_terms"("status");
CREATE INDEX IF NOT EXISTS "academic_terms_start_date_end_date_idx" ON "academic_terms"("start_date", "end_date");

-- Foreign key for academic_terms.created_by_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'academic_terms_created_by_id_fkey'
    ) THEN
        ALTER TABLE "academic_terms"
            ADD CONSTRAINT "academic_terms_created_by_id_fkey"
            FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 2. Create term_snapshots table
CREATE TABLE IF NOT EXISTS "term_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "term_id" UUID NOT NULL,
    "term_code" VARCHAR(50) NOT NULL,
    "term_name" VARCHAR(100) NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "captured_by_id" UUID NOT NULL,

    CONSTRAINT "term_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "term_snapshots_term_id_idx" ON "term_snapshots"("term_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'term_snapshots_term_id_fkey'
    ) THEN
        ALTER TABLE "term_snapshots"
            ADD CONSTRAINT "term_snapshots_term_id_fkey"
            FOREIGN KEY ("term_id") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'term_snapshots_captured_by_id_fkey'
    ) THEN
        ALTER TABLE "term_snapshots"
            ADD CONSTRAINT "term_snapshots_captured_by_id_fkey"
            FOREIGN KEY ("captured_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- 3. Create term_rollovers table
CREATE TABLE IF NOT EXISTS "term_rollovers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "from_term_id" UUID,
    "to_term_id" UUID NOT NULL,
    "executed_by_id" UUID NOT NULL,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(50) NOT NULL DEFAULT 'completed',
    "summary_json" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "term_rollovers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "term_rollovers_from_term_id_idx" ON "term_rollovers"("from_term_id");
CREATE INDEX IF NOT EXISTS "term_rollovers_to_term_id_idx" ON "term_rollovers"("to_term_id");
CREATE INDEX IF NOT EXISTS "term_rollovers_executed_at_idx" ON "term_rollovers"("executed_at" DESC);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'term_rollovers_from_term_id_fkey'
    ) THEN
        ALTER TABLE "term_rollovers"
            ADD CONSTRAINT "term_rollovers_from_term_id_fkey"
            FOREIGN KEY ("from_term_id") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'term_rollovers_to_term_id_fkey'
    ) THEN
        ALTER TABLE "term_rollovers"
            ADD CONSTRAINT "term_rollovers_to_term_id_fkey"
            FOREIGN KEY ("to_term_id") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'term_rollovers_executed_by_id_fkey'
    ) THEN
        ALTER TABLE "term_rollovers"
            ADD CONSTRAINT "term_rollovers_executed_by_id_fkey"
            FOREIGN KEY ("executed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
