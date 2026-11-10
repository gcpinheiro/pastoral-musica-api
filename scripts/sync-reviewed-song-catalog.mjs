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
const actorUserId = argument('actor-user-id');
const additionalReviewTitle = argument('review-title');
if (!file || !parishId || !actorUserId)
  throw new Error('--file, --parish-id e --actor-user-id são obrigatórios.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const catalog = JSON.parse(await readFile(file, 'utf8'));
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');
  const updated = [];
  for (const item of catalog.items) {
    const matches = await client.query(
      `SELECT id FROM songs
        WHERE parish_id=$1
          AND lower(trim(title))=lower(trim($2))
          AND lower(trim(author))=lower(trim($3))
          AND status='ACTIVE'`,
      [parishId, item.title, item.author],
    );
    if (matches.rowCount !== 1)
      throw new Error(`${item.title} / ${item.author}: esperado 1 registro, encontrados ${matches.rowCount}.`);

    const canonical = JSON.stringify({
      title: item.title.trim(),
      author: item.author.trim(),
      defaultKey: item.defaultKey.trim(),
      liturgicalMoments: [...item.liturgicalMoments].map((value) => value.trim()).sort(),
      lyrics: item.lyrics.trim(),
      chords: item.chords.trim(),
    });
    const contentHash = createHash('sha256').update(canonical).digest('hex');
    const result = await client.query(
      `UPDATE songs
          SET title=$1, author=$2, default_key=$3, liturgical_moments=$4::jsonb,
              lyrics=$5, chords=$6, content_mode='INTERNAL', external_url=NULL,
              youtube_url=$7, rights_status=$8, rights_type=$9, source_url=$10,
              proof_url=$11, attribution=$12, content_hash=$13,
              rights_reviewed_at=$14, chords_reviewed=true,
              chords_reviewed_at=now(), updated_at=now()
        WHERE id=$15
        RETURNING id,title,author`,
      [
        item.title,
        item.author,
        item.defaultKey,
        JSON.stringify(item.liturgicalMoments),
        item.lyrics,
        item.chords,
        item.youtubeUrl ?? null,
        item.rights.status,
        item.rights.type,
        item.rights.sourceUrl ?? null,
        item.rights.proofUrl ?? null,
        item.rights.attribution,
        contentHash,
        item.rights.reviewedAt,
        matches.rows[0].id,
      ],
    );
    await client.query(
      `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'SYNC_REVIEWED_SONG_CHORDS','SONG',$3,$4::jsonb)`,
      [parishId, actorUserId, result.rows[0].id, JSON.stringify({ sourceDocument: item.rights.sourceDocument })],
    );
    updated.push(result.rows[0]);
  }

  if (additionalReviewTitle) {
    const result = await client.query(
      `UPDATE songs SET chords_reviewed=true,chords_reviewed_at=now(),updated_at=now()
        WHERE parish_id=$1 AND lower(trim(title))=lower(trim($2)) AND status='ACTIVE'
        RETURNING id,title,author`,
      [parishId, additionalReviewTitle],
    );
    if (result.rowCount !== 1)
      throw new Error(`${additionalReviewTitle}: esperado 1 registro, encontrados ${result.rowCount}.`);
    await client.query(
      `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'REVIEW_SONG_CHORDS','SONG',$3,$4::jsonb)`,
      [parishId, actorUserId, result.rows[0].id, JSON.stringify({ source: 'catalog-sync' })],
    );
    updated.push(result.rows[0]);
  }

  await client.query('COMMIT');
  console.log(JSON.stringify({ updated }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
