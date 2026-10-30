-- CreateTable: drive_windows
CREATE TABLE IF NOT EXISTS "drive_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(50) NOT NULL,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "drive_windows_time_order_check" CHECK ("closes_at" > "opens_at")
);

-- Unique and performance indexes
CREATE UNIQUE INDEX IF NOT EXISTS "drive_windows_type_key" ON "drive_windows"("type");
CREATE INDEX IF NOT EXISTS "drive_windows_type_is_open_idx" ON "drive_windows"("type", "is_open");

-- Role permissions
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "drive_windows" TO csi_app;
    END IF;
END $$;

-- Initial seed for membership drive window
INSERT INTO "drive_windows" ("type", "opens_at", "closes_at", "is_open")
VALUES ('membership', '2026-07-01 00:00:00+00', '2026-11-30 23:59:59+00', true)
ON CONFLICT ("type") DO NOTHING;
