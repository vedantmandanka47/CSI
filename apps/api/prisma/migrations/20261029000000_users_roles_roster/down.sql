-- Revert Migration: 20261029000000_users_roles_roster (INT-11)
DROP TABLE IF EXISTS "role_assignments";
DROP TABLE IF EXISTS "roster_entries";
DROP TABLE IF EXISTS "users";
