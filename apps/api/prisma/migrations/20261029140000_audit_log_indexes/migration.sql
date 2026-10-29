-- CreateIndex: audit_log_created_at_action_idx
CREATE INDEX IF NOT EXISTS "audit_log_created_at_action_idx" ON "audit_log"("created_at" DESC, "action");

-- CreateIndex: audit_log_actor_id_created_at_idx
CREATE INDEX IF NOT EXISTS "audit_log_actor_id_created_at_idx" ON "audit_log"("actor_id", "created_at" DESC);
