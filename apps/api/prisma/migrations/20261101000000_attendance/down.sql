-- Down migration for 20261101000000_attendance
DROP TABLE IF EXISTS "attendance_records" CASCADE;
DROP TABLE IF EXISTS "attendance_sessions" CASCADE;
DROP TABLE IF EXISTS "idempotency_keys" CASCADE;

