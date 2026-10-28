ALTER TABLE "songs"
  ADD COLUMN "youtube_url" TEXT;

ALTER TABLE "songs"
  ADD CONSTRAINT "songs_youtube_url_check"
  CHECK (
    "youtube_url" IS NULL
    OR "youtube_url" ~ '^https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]{11}([?&].*)?$'
  );
