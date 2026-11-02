-- Migration: 20261109000000_grant_runtime_permissions
-- Ensure runtime application role `csi_app` has appropriate DML privileges
-- across all application tables and sequences in schema public.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        GRANT USAGE ON SCHEMA public TO csi_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO csi_app;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO csi_app;

        -- Ensure future tables created in public schema by csi_migrator inherit privileges
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csi_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO csi_app;
    END IF;
END $$;
