-- Down migration: 20261107000000_annual_term_rollover_and_archival
-- Reverses creation of term_rollovers, term_snapshots, and academic_terms

DROP TABLE IF EXISTS "term_rollovers";
DROP TABLE IF EXISTS "term_snapshots";
DROP TABLE IF EXISTS "academic_terms";
