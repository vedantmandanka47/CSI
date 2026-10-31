-- CreateTable: certificate_batches
CREATE TABLE IF NOT EXISTS "certificate_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "template_id" VARCHAR(100) NOT NULL,
    "template_config" JSONB NOT NULL,
    "certificate_type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "certificate_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificate_batches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "certificate_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "certificate_batches_event_id_status_idx" ON "certificate_batches"("event_id", "status");
CREATE INDEX IF NOT EXISTS "certificate_batches_created_by_id_idx" ON "certificate_batches"("created_by_id");

-- CreateTable: certificates
CREATE TABLE IF NOT EXISTS "certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID,
    "event_id" UUID NOT NULL,
    "recipient_type" VARCHAR(20) NOT NULL DEFAULT 'member',
    "recipient_id" UUID,
    "recipient_email" CITEXT NOT NULL,
    "recipient_name" VARCHAR(150) NOT NULL,
    "certificate_type" VARCHAR(50) NOT NULL DEFAULT 'participation',
    "certificate_number" VARCHAR(100) NOT NULL,
    "issue_date" VARCHAR(50) NOT NULL,
    "achievement" VARCHAR(200),
    "metadata" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "storage_path" VARCHAR(255),
    "file_hash" VARCHAR(64),
    "file_size_bytes" INTEGER,
    "error_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificates_certificate_number_key" UNIQUE ("certificate_number"),
    CONSTRAINT "event_email_cert_type_unique" UNIQUE ("event_id", "recipient_email", "certificate_type"),
    CONSTRAINT "certificates_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "certificate_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "certificates_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "certificates_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "certificates_event_id_status_idx" ON "certificates"("event_id", "status");
CREATE INDEX IF NOT EXISTS "certificates_recipient_id_idx" ON "certificates"("recipient_id");
CREATE INDEX IF NOT EXISTS "certificates_batch_id_status_idx" ON "certificates"("batch_id", "status");
