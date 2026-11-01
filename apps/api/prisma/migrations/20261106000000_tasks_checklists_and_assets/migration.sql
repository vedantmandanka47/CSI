-- CreateTable: tasks
CREATE TABLE IF NOT EXISTS "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "committee_id" UUID NOT NULL,
    "event_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'todo',
    "priority" VARCHAR(50) NOT NULL DEFAULT 'medium',
    "due_date" TIMESTAMPTZ(6),
    "assigned_to_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: checklists
CREATE TABLE IF NOT EXISTS "checklists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "committee_id" UUID NOT NULL,
    "event_id" UUID,
    "task_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_template" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: checklist_items
CREATE TABLE IF NOT EXISTS "checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checklist_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by_id" UUID,
    "assigned_to_id" UUID,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: checklist_runs
CREATE TABLE IF NOT EXISTS "checklist_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checklist_id" UUID NOT NULL,
    "committee_id" UUID NOT NULL,
    "event_id" UUID,
    "status" VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    "sign_off_notes" TEXT,
    "signed_off_at" TIMESTAMPTZ(6),
    "signed_off_by_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: committee_assets
CREATE TABLE IF NOT EXISTS "committee_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "committee_id" UUID NOT NULL,
    "event_id" UUID,
    "task_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "category" VARCHAR(50) NOT NULL DEFAULT 'other',
    "file_name" VARCHAR(255) NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "review_notes" TEXT,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "committee_assets_pkey" PRIMARY KEY ("id")
);

-- Indexes for tasks
CREATE INDEX IF NOT EXISTS "tasks_committee_id_idx" ON "tasks"("committee_id");
CREATE INDEX IF NOT EXISTS "tasks_assigned_to_id_idx" ON "tasks"("assigned_to_id");
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks"("status");
CREATE INDEX IF NOT EXISTS "tasks_event_id_idx" ON "tasks"("event_id");

-- Indexes for checklists
CREATE INDEX IF NOT EXISTS "checklists_committee_id_idx" ON "checklists"("committee_id");
CREATE INDEX IF NOT EXISTS "checklists_event_id_idx" ON "checklists"("event_id");
CREATE INDEX IF NOT EXISTS "checklists_task_id_idx" ON "checklists"("task_id");

-- Indexes for checklist_items
CREATE INDEX IF NOT EXISTS "checklist_items_checklist_id_order_index_idx" ON "checklist_items"("checklist_id", "order_index");
CREATE INDEX IF NOT EXISTS "checklist_items_assigned_to_id_idx" ON "checklist_items"("assigned_to_id");

-- Indexes for checklist_runs
CREATE INDEX IF NOT EXISTS "checklist_runs_checklist_id_idx" ON "checklist_runs"("checklist_id");
CREATE INDEX IF NOT EXISTS "checklist_runs_committee_id_idx" ON "checklist_runs"("committee_id");
CREATE INDEX IF NOT EXISTS "checklist_runs_event_id_idx" ON "checklist_runs"("event_id");
CREATE INDEX IF NOT EXISTS "checklist_runs_status_idx" ON "checklist_runs"("status");

-- Indexes for committee_assets
CREATE INDEX IF NOT EXISTS "committee_assets_committee_id_idx" ON "committee_assets"("committee_id");
CREATE INDEX IF NOT EXISTS "committee_assets_event_id_idx" ON "committee_assets"("event_id");
CREATE INDEX IF NOT EXISTS "committee_assets_task_id_idx" ON "committee_assets"("task_id");
CREATE INDEX IF NOT EXISTS "committee_assets_status_idx" ON "committee_assets"("status");
CREATE INDEX IF NOT EXISTS "committee_assets_uploaded_by_id_idx" ON "committee_assets"("uploaded_by_id");

-- Foreign keys for tasks
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_committee_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_committee_id_fkey"
            FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_event_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assigned_to_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey"
            FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_created_by_id_fkey') THEN
        ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey"
            FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Foreign keys for checklists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklists_committee_id_fkey') THEN
        ALTER TABLE "checklists" ADD CONSTRAINT "checklists_committee_id_fkey"
            FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklists_event_id_fkey') THEN
        ALTER TABLE "checklists" ADD CONSTRAINT "checklists_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklists_task_id_fkey') THEN
        ALTER TABLE "checklists" ADD CONSTRAINT "checklists_task_id_fkey"
            FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklists_created_by_id_fkey') THEN
        ALTER TABLE "checklists" ADD CONSTRAINT "checklists_created_by_id_fkey"
            FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Foreign keys for checklist_items
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_items_checklist_id_fkey') THEN
        ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey"
            FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_items_completed_by_id_fkey') THEN
        ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_completed_by_id_fkey"
            FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_items_assigned_to_id_fkey') THEN
        ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_assigned_to_id_fkey"
            FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Foreign keys for checklist_runs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_runs_checklist_id_fkey') THEN
        ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_checklist_id_fkey"
            FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_runs_committee_id_fkey') THEN
        ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_committee_id_fkey"
            FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_runs_event_id_fkey') THEN
        ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_runs_signed_off_by_id_fkey') THEN
        ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_signed_off_by_id_fkey"
            FOREIGN KEY ("signed_off_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_runs_created_by_id_fkey') THEN
        ALTER TABLE "checklist_runs" ADD CONSTRAINT "checklist_runs_created_by_id_fkey"
            FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Foreign keys for committee_assets
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committee_assets_committee_id_fkey') THEN
        ALTER TABLE "committee_assets" ADD CONSTRAINT "committee_assets_committee_id_fkey"
            FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committee_assets_event_id_fkey') THEN
        ALTER TABLE "committee_assets" ADD CONSTRAINT "committee_assets_event_id_fkey"
            FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committee_assets_task_id_fkey') THEN
        ALTER TABLE "committee_assets" ADD CONSTRAINT "committee_assets_task_id_fkey"
            FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committee_assets_reviewed_by_id_fkey') THEN
        ALTER TABLE "committee_assets" ADD CONSTRAINT "committee_assets_reviewed_by_id_fkey"
            FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'committee_assets_uploaded_by_id_fkey') THEN
        ALTER TABLE "committee_assets" ADD CONSTRAINT "committee_assets_uploaded_by_id_fkey"
            FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
