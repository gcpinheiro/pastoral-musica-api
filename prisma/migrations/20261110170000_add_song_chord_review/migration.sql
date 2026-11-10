ALTER TABLE songs
  ADD COLUMN chords_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN chords_reviewed_at timestamptz;
