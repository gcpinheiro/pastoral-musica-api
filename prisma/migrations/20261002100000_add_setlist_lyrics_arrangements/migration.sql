ALTER TABLE "setlist_items"
  ADD COLUMN "lyrics_snapshot" TEXT,
  ADD COLUMN "formatted_lyrics" JSONB;

UPDATE "setlist_items" AS item
SET "lyrics_snapshot" = song."lyrics"
FROM "songs" AS song
WHERE song."id" = item."song_id";

ALTER TABLE "setlist_items"
  ALTER COLUMN "lyrics_snapshot" SET NOT NULL;
