-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_no" VARCHAR(50),
    "name" VARCHAR(100) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(20),
    "branch" VARCHAR(50),
    "year" INTEGER,
    "photo" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- Unique index on email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Sparse unique index on enrollment_no (Q-ADMIN-01: nullable for non-student administrators)
CREATE UNIQUE INDEX "users_enrollment_no_key" ON "users"("enrollment_no") WHERE "enrollment_no" IS NOT NULL;

-- Index on user status
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateTable: roster_entries (FR-ADM-03)
CREATE TABLE "roster_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year" VARCHAR(20) NOT NULL,
    "enrollment_no" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "branch" VARCHAR(50) NOT NULL,
    "year" INTEGER NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on academic_year and enrollment_no
CREATE UNIQUE INDEX "roster_academic_enrollment_unique" ON "roster_entries"("academic_year", "enrollment_no");

-- CreateTable: role_assignments (FR-ADM-04)
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "committee_id" UUID,
    "term_start" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "term_end" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- Indexes and foreign keys on role_assignments
CREATE INDEX "role_assignments_user_idx" ON "role_assignments"("user_id");
CREATE INDEX "role_assignments_role_idx" ON "role_assignments"("role_id");
CREATE INDEX "role_assignments_term_idx" ON "role_assignments"("term_start", "term_end");

ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Grant DML privileges on new tables to runtime application role csi_app
GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "roster_entries", "role_assignments" TO csi_app;
