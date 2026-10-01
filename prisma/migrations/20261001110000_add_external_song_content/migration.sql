ALTER TABLE "songs"
  ADD COLUMN "content_mode" TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "external_url" TEXT;

ALTER TABLE "songs"
  ADD CONSTRAINT "songs_content_mode_check"
  CHECK ("content_mode" IN ('INTERNAL', 'EXTERNAL_EMBED')),
  ADD CONSTRAINT "songs_external_content_check"
  CHECK (
    ("content_mode" = 'INTERNAL' AND "external_url" IS NULL)
    OR
    ("content_mode" = 'EXTERNAL_EMBED' AND "external_url" IS NOT NULL)
  );
