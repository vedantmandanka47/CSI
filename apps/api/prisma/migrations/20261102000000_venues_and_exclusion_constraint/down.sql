-- Drop exclusion constraint on events
ALTER TABLE "events"
DROP CONSTRAINT IF EXISTS "events_venue_time_excl";

-- Revert columns on venues
ALTER TABLE "venues"
DROP COLUMN IF EXISTS "updated_at",
DROP COLUMN IF EXISTS "is_active",
DROP COLUMN IF EXISTS "is_available",
DROP COLUMN IF EXISTS "av_capabilities",
DROP COLUMN IF EXISTS "room_number",
DROP COLUMN IF EXISTS "building",
DROP COLUMN IF EXISTS "description";

