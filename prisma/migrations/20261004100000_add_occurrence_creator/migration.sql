ALTER TABLE "occurrences"
  ADD COLUMN "created_by" UUID;

ALTER TABLE "occurrences"
  ADD CONSTRAINT "occurrences_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "occurrences_created_by_idx" ON "occurrences"("created_by");
