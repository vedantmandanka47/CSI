-- AlterTable: venues
ALTER TABLE "venues"
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "building" VARCHAR(100) NOT NULL DEFAULT 'Main Building',
ADD COLUMN IF NOT EXISTS "room_number" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "av_capabilities" TEXT[] NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "is_available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Ensure btree_gist extension exists for GiST UUID and scalar indexing
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Safety check: ensure no overlapping events exist before adding the constraint
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "events" e1
        JOIN "events" e2 ON e1."venue_id" = e2."venue_id" AND e1."id" != e2."id"
        WHERE e1."venue_id" IS NOT NULL
          AND e1."state" != 'cancelled'
          AND e2."state" != 'cancelled'
          AND tstzrange(e1."starts_at", e1."ends_at", '[)') && tstzrange(e2."starts_at", e2."ends_at", '[)')
    ) THEN
        RAISE EXCEPTION 'Cannot apply exclusion constraint: Existing overlapping active events detected at the same venue.';
    END IF;
END $$;

-- Drop constraint if it already exists from a previous run
ALTER TABLE "events"
DROP CONSTRAINT IF EXISTS "events_venue_time_excl";

-- Add exclusion constraint on events: mathematical double-booking prevention
ALTER TABLE "events"
ADD CONSTRAINT "events_venue_time_excl"
EXCLUDE USING gist (
    "venue_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
)
WHERE ("venue_id" IS NOT NULL AND "state" != 'cancelled');

