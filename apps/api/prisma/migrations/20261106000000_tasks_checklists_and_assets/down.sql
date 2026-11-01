-- DropForeignKey: committee_assets
ALTER TABLE IF EXISTS "committee_assets" DROP CONSTRAINT IF EXISTS "committee_assets_uploaded_by_id_fkey";
ALTER TABLE IF EXISTS "committee_assets" DROP CONSTRAINT IF EXISTS "committee_assets_reviewed_by_id_fkey";
ALTER TABLE IF EXISTS "committee_assets" DROP CONSTRAINT IF EXISTS "committee_assets_task_id_fkey";
ALTER TABLE IF EXISTS "committee_assets" DROP CONSTRAINT IF EXISTS "committee_assets_event_id_fkey";
ALTER TABLE IF EXISTS "committee_assets" DROP CONSTRAINT IF EXISTS "committee_assets_committee_id_fkey";

-- DropForeignKey: checklist_runs
ALTER TABLE IF EXISTS "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_created_by_id_fkey";
ALTER TABLE IF EXISTS "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_signed_off_by_id_fkey";
ALTER TABLE IF EXISTS "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_event_id_fkey";
ALTER TABLE IF EXISTS "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_committee_id_fkey";
ALTER TABLE IF EXISTS "checklist_runs" DROP CONSTRAINT IF EXISTS "checklist_runs_checklist_id_fkey";

-- DropForeignKey: checklist_items
ALTER TABLE IF EXISTS "checklist_items" DROP CONSTRAINT IF EXISTS "checklist_items_assigned_to_id_fkey";
ALTER TABLE IF EXISTS "checklist_items" DROP CONSTRAINT IF EXISTS "checklist_items_completed_by_id_fkey";
ALTER TABLE IF EXISTS "checklist_items" DROP CONSTRAINT IF EXISTS "checklist_items_checklist_id_fkey";

-- DropForeignKey: checklists
ALTER TABLE IF EXISTS "checklists" DROP CONSTRAINT IF EXISTS "checklists_created_by_id_fkey";
ALTER TABLE IF EXISTS "checklists" DROP CONSTRAINT IF EXISTS "checklists_task_id_fkey";
ALTER TABLE IF EXISTS "checklists" DROP CONSTRAINT IF EXISTS "checklists_event_id_fkey";
ALTER TABLE IF EXISTS "checklists" DROP CONSTRAINT IF EXISTS "checklists_committee_id_fkey";

-- DropForeignKey: tasks
ALTER TABLE IF EXISTS "tasks" DROP CONSTRAINT IF EXISTS "tasks_created_by_id_fkey";
ALTER TABLE IF EXISTS "tasks" DROP CONSTRAINT IF EXISTS "tasks_assigned_to_id_fkey";
ALTER TABLE IF EXISTS "tasks" DROP CONSTRAINT IF EXISTS "tasks_event_id_fkey";
ALTER TABLE IF EXISTS "tasks" DROP CONSTRAINT IF EXISTS "tasks_committee_id_fkey";

-- DropIndexes
DROP INDEX IF EXISTS "committee_assets_uploaded_by_id_idx";
DROP INDEX IF EXISTS "committee_assets_status_idx";
DROP INDEX IF EXISTS "committee_assets_task_id_idx";
DROP INDEX IF EXISTS "committee_assets_event_id_idx";
DROP INDEX IF EXISTS "committee_assets_committee_id_idx";

DROP INDEX IF EXISTS "checklist_runs_status_idx";
DROP INDEX IF EXISTS "checklist_runs_event_id_idx";
DROP INDEX IF EXISTS "checklist_runs_committee_id_idx";
DROP INDEX IF EXISTS "checklist_runs_checklist_id_idx";

DROP INDEX IF EXISTS "checklist_items_assigned_to_id_idx";
DROP INDEX IF EXISTS "checklist_items_checklist_id_order_index_idx";

DROP INDEX IF EXISTS "checklists_task_id_idx";
DROP INDEX IF EXISTS "checklists_event_id_idx";
DROP INDEX IF EXISTS "checklists_committee_id_idx";

DROP INDEX IF EXISTS "tasks_event_id_idx";
DROP INDEX IF EXISTS "tasks_status_idx";
DROP INDEX IF EXISTS "tasks_assigned_to_id_idx";
DROP INDEX IF EXISTS "tasks_committee_id_idx";

-- DropTable
DROP TABLE IF EXISTS "committee_assets";
DROP TABLE IF EXISTS "checklist_runs";
DROP TABLE IF EXISTS "checklist_items";
DROP TABLE IF EXISTS "checklists";
DROP TABLE IF EXISTS "tasks";
