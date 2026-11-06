-- Down migration: 20261109000000_grant_runtime_permissions
-- Revert runtime role csi_app privileges on schema, tables, sequences, and default privileges.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csi_app') THEN
        -- 1. Revert default privileges
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM csi_app;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM csi_app;

        -- 2. Revoke table and sequence privileges granted in public schema
        REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM csi_app;
        REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM csi_app;

        -- 3. Revoke schema USAGE privilege
        REVOKE USAGE ON SCHEMA public FROM csi_app;
    END IF;
END $$;

