-- Down migration: 20261109000000_grant_runtime_permissions
-- Revert default privileges assigned to runtime role csi_app

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM csi_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM csi_app;
    END IF;
END $$;
