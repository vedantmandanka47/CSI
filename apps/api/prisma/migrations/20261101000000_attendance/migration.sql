-- Migration: 20261101000000_attendance
-- Module M9: Attendance Sessions, Records, and Idempotency Keys

-- CreateTable: attendance_sessions
CREATE TABLE IF NOT EXISTS "attendance_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "audience" VARCHAR(50) NOT NULL DEFAULT 'all',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "totp_secret" VARCHAR(128) NOT NULL,
    "totp_step_seconds" INTEGER NOT NULL DEFAULT 30,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_sessions_ends_after_starts" CHECK ("ends_at" > "starts_at")
);

-- CreateTable: attendance_records
CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "subject_type" VARCHAR(20) NOT NULL DEFAULT 'member',
    "subject_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL DEFAULT 'qr_scan',
    "status" VARCHAR(20) NOT NULL DEFAULT 'verified',
    "client_uuid" VARCHAR(64) NOT NULL,
    "client_marked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_by_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_records_client_uuid_key" UNIQUE ("client_uuid"),
    CONSTRAINT "session_subject_unique" UNIQUE ("session_id", "subject_type", "subject_id")
);

-- CreateTable: idempotency_keys
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(64) NOT NULL,
    "user_id" UUID,
    "route" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response" JSONB,
    "status_code" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_keys_key_key" UNIQUE ("key")
);

-- Indexes for attendance_sessions
CREATE INDEX IF NOT EXISTS "attendance_sessions_event_id_is_open_idx" ON "attendance_sessions"("event_id", "is_open");
CREATE INDEX IF NOT EXISTS "attendance_sessions_created_by_id_idx" ON "attendance_sessions"("created_by_id");

-- Indexes for attendance_records
CREATE INDEX IF NOT EXISTS "attendance_records_session_id_status_idx" ON "attendance_records"("session_id", "status");
CREATE INDEX IF NOT EXISTS "attendance_records_event_id_idx" ON "attendance_records"("event_id");
CREATE INDEX IF NOT EXISTS "attendance_records_subject_id_idx" ON "attendance_records"("subject_id");
CREATE INDEX IF NOT EXISTS "attendance_records_marked_by_id_idx" ON "attendance_records"("marked_by_id");

-- Indexes for idempotency_keys
CREATE INDEX IF NOT EXISTS "idempotency_keys_key_idx" ON "idempotency_keys"("key");
CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- Foreign Keys for attendance_sessions
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_event_id_fkey'
    ) THEN
        ALTER TABLE "attendance_sessions"
        ADD CONSTRAINT "attendance_sessions_event_id_fkey"
        FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_created_by_id_fkey'
    ) THEN
        ALTER TABLE "attendance_sessions"
        ADD CONSTRAINT "attendance_sessions_created_by_id_fkey"
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Foreign Keys for attendance_records
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_session_id_fkey'
    ) THEN
        ALTER TABLE "attendance_records"
        ADD CONSTRAINT "attendance_records_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_event_id_fkey'
    ) THEN
        ALTER TABLE "attendance_records"
        ADD CONSTRAINT "attendance_records_event_id_fkey"
        FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'attendance_records_marked_by_id_fkey'
    ) THEN
        ALTER TABLE "attendance_records"
        ADD CONSTRAINT "attendance_records_marked_by_id_fkey"
        FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

