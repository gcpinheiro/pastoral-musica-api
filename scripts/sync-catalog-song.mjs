import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Client } from 'pg';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const file = argument('file');
const parishId = argument('parish-id');
const title = argument('title');
if (!file || !parishId || !title) throw new Error('--file, --parish-id e --title são obrigatórios.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const catalog = JSON.parse(await readFile(file, 'utf8'));
const item = catalog.items.find((candidate) => candidate.title === title);
if (!item) throw new Error(`Música não encontrada no catálogo: ${title}`);

const canonical = JSON.stringify({
  title: item.title.trim(),
  author: item.author.trim(),
  defaultKey: item.defaultKey.trim(),
  liturgicalMoments: [...item.liturgicalMoments].map((value) => value.trim()).sort(),
  lyrics: item.lyrics.trim(),
  chords: item.chords.trim(),
});
const contentHash = createHash('sha256').update(canonical).digest('hex');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (process.argv.includes('--inspect')) {
    const candidates = await client.query(
      `SELECT id, title, author, status, content_hash,
              length(lyrics) AS lyrics_length, length(chords) AS chords_length
         FROM songs
        WHERE parish_id=$1 AND lower(title)=lower($2)
        ORDER BY created_at`,
      [parishId, item.title],
    );
    console.log(JSON.stringify({ targetContentHash: contentHash, candidates: candidates.rows }, null, 2));
    process.exitCode = 0;
  } else {
  const matches = await client.query(
    `SELECT id FROM songs
      WHERE parish_id=$1 AND lower(trim(title))=lower(trim($2))
      ORDER BY created_at, id`,
    [parishId, item.title],
  );
  if (!matches.rowCount) throw new Error(`Música não encontrada no banco: ${item.title}`);
  if (matches.rowCount > 1 && !process.argv.includes('--deduplicate'))
    throw new Error(`Existem ${matches.rowCount} registros com este título. Revise e use --deduplicate.`);
  const canonicalId = matches.rows[0].id;
  const duplicateIds = matches.rows.slice(1).map((row) => row.id);
  await client.query('BEGIN');
  if (duplicateIds.length) {
    await client.query(
      'UPDATE setlist_items SET song_id=$1 WHERE song_id=ANY($2::uuid[])',
      [canonicalId, duplicateIds],
    );
    await client.query('DELETE FROM songs WHERE id=ANY($1::uuid[])', [duplicateIds]);
  }
  const result = await client.query(
    `UPDATE songs
        SET default_key=$1,
            liturgical_moments=$2::jsonb,
            lyrics=$3,
            chords=$4,
            content_mode='INTERNAL',
            external_url=NULL,
            rights_status=$5,
            rights_type=$6,
            attribution=$7,
            content_hash=$8,
            rights_reviewed_at=$9,
            updated_at=now()
      WHERE id=$10
      RETURNING id, title`,
    [
      item.defaultKey,
      JSON.stringify(item.liturgicalMoments),
      item.lyrics,
      item.chords,
      item.rights.status,
      item.rights.type,
      item.rights.attribution,
      contentHash,
      item.rights.reviewedAt,
      canonicalId,
    ],
  );
  if (result.rowCount !== 1) throw new Error(`Esperado 1 registro, encontrados ${result.rowCount}.`);
  await client.query('COMMIT');
  console.log(JSON.stringify({ updated: result.rowCount, deduplicated: duplicateIds.length, song: result.rows[0] }));
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
