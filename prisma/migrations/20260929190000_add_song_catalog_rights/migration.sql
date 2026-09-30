ALTER TABLE "songs"
  ADD COLUMN "rights_status" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "rights_type" TEXT,
  ADD COLUMN "source_url" TEXT,
  ADD COLUMN "proof_url" TEXT,
  ADD COLUMN "attribution" TEXT,
  ADD COLUMN "content_hash" TEXT,
  ADD COLUMN "import_batch_id" UUID,
  ADD COLUMN "rights_reviewed_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "songs_parish_content_hash_key"
  ON "songs"("parish_id", "content_hash");
