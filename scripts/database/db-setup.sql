-- ============================================================================
-- CSI GCET SB — One-Time Database Setup (Section 4.1)
-- Run this as PostgreSQL superuser (e.g. postgres) on Port 5432.
-- Replace '<choose-locally>' with your secure local passwords.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BLOCK 1: Run while connected to the default maintenance DB ('postgres')
-- ----------------------------------------------------------------------------
CREATE ROLE csi_migrator LOGIN PASSWORD '<choose-locally>' CREATEDB;  -- schema owner & shadow DB
CREATE ROLE csi_app      LOGIN PASSWORD '<choose-locally>';           -- runtime role: DML only

CREATE DATABASE csi_gcet_dev  OWNER csi_migrator;
CREATE DATABASE csi_gcet_test OWNER csi_migrator;

-- ----------------------------------------------------------------------------
-- BLOCK 2: Run while connected to 'csi_gcet_dev'
-- In pgAdmin / GUI: open a Query Tool connected to csi_gcet_dev.
-- In psql CLI: \c csi_gcet_dev
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
GRANT CONNECT ON DATABASE csi_gcet_dev TO csi_app;
GRANT USAGE ON SCHEMA public TO csi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csi_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csi_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO csi_app;

-- ----------------------------------------------------------------------------
-- BLOCK 3: Run while connected to 'csi_gcet_test'
-- In pgAdmin / GUI: open a Query Tool connected to csi_gcet_test.
-- In psql CLI: \c csi_gcet_test
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
GRANT CONNECT ON DATABASE csi_gcet_test TO csi_app;
GRANT USAGE ON SCHEMA public TO csi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csi_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csi_app;
ALTER DEFAULT PRIVILEGES FOR ROLE csi_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO csi_app;
