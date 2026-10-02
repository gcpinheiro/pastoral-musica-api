ALTER TABLE "occurrences"
  ADD COLUMN "archived_at" TIMESTAMPTZ(6);

CREATE INDEX "occurrences_parish_archived_idx"
  ON "occurrences"("parish_id", "archived_at");
