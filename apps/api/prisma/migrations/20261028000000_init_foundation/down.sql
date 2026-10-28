-- Rollback migration: 20261028000000_init_foundation (INT-11)

DROP TRIGGER IF EXISTS audit_log_immutable_trigger ON "audit_log";
DROP FUNCTION IF EXISTS audit_log_prevent_mutation();

DROP TABLE IF EXISTS "audit_log";
DROP TABLE IF EXISTS "committees";
DROP TABLE IF EXISTS "roles";
