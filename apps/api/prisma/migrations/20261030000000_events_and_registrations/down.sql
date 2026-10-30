-- Down migration for 20261030000000_events_and_registrations
DROP TABLE IF EXISTS "event_guests" CASCADE;
DROP TABLE IF EXISTS "registrations" CASCADE;
DROP TABLE IF EXISTS "events" CASCADE;
DROP TABLE IF EXISTS "venues" CASCADE;
