-- CreateTable: venues
CREATE TABLE IF NOT EXISTS "venues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "map_url" VARCHAR(255),
    "contact" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venues_capacity_check" CHECK ("capacity" > 0)
);

-- CreateTable: events
CREATE TABLE IF NOT EXISTS "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(50) NOT NULL DEFAULT 'workshop',
    "venue_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "registration_opens_at" TIMESTAMPTZ(6),
    "registration_closes_at" TIMESTAMPTZ(6),
    "capacity" INTEGER NOT NULL DEFAULT 50,
    "state" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "poster_url" VARCHAR(255),
    "certificate_template_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "events_time_order_check" CHECK ("ends_at" > "starts_at"),
    CONSTRAINT "events_capacity_check" CHECK ("capacity" > 0)
);

-- CreateTable: registrations
CREATE TABLE IF NOT EXISTS "registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'registered',
    "registered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: event_guests
CREATE TABLE IF NOT EXISTS "event_guests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" CITEXT NOT NULL,
    "college" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "consent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(50) NOT NULL DEFAULT 'registered',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_guests_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "events_slug_key" ON "events"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "event_user_unique" ON "registrations"("event_id", "user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "event_guest_unique" ON "event_guests"("event_id", "email");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "events_state_starts_at_idx" ON "events"("state", "starts_at");
CREATE INDEX IF NOT EXISTS "events_category_idx" ON "events"("category");
CREATE INDEX IF NOT EXISTS "events_venue_id_idx" ON "events"("venue_id");

CREATE INDEX IF NOT EXISTS "registrations_event_id_status_idx" ON "registrations"("event_id", "status");
CREATE INDEX IF NOT EXISTS "registrations_user_id_idx" ON "registrations"("user_id");

CREATE INDEX IF NOT EXISTS "event_guests_event_id_status_idx" ON "event_guests"("event_id", "status");

-- Foreign key constraints
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_venue_id_fkey') THEN
        ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_event_id_fkey') THEN
        ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_user_id_fkey') THEN
        ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_guests_event_id_fkey') THEN
        ALTER TABLE "event_guests" ADD CONSTRAINT "event_guests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Role grants if csi_app role exists
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "venues", "events", "registrations", "event_guests" TO csi_app;
    END IF;
END $$;
