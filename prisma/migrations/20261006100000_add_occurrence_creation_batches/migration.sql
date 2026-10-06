CREATE TABLE "occurrence_creation_batches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "parish_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "occurrence_creation_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "occurrences"
  ADD COLUMN "creation_batch_id" UUID;

CREATE UNIQUE INDEX "occurrence_batches_parish_key_unique"
  ON "occurrence_creation_batches"("parish_id", "idempotency_key");

CREATE INDEX "occurrence_batches_created_by_idx"
  ON "occurrence_creation_batches"("created_by");

CREATE INDEX "occurrences_creation_batch_idx"
  ON "occurrences"("creation_batch_id");

ALTER TABLE "occurrence_creation_batches"
  ADD CONSTRAINT "occurrence_creation_batches_parish_id_fkey"
  FOREIGN KEY ("parish_id") REFERENCES "parishes"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "occurrence_creation_batches"
  ADD CONSTRAINT "occurrence_creation_batches_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "occurrences"
  ADD CONSTRAINT "occurrences_creation_batch_id_fkey"
  FOREIGN KEY ("creation_batch_id") REFERENCES "occurrence_creation_batches"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
