import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Client } from 'pg';

const PARISH_ID = '5b0cba6f-d551-475b-9736-a6ddcfa42b01';
const OCCURRENCE_ID = '937a511a-03d1-40f1-b0f0-065ff2a72617';
const ACTOR_USER_ID = '54b4436d-8630-457d-a4df-8a3363e30772';
const catalog = JSON.parse(await readFile(new URL('../catalog/missa-novembro-guadalupe-2026-11-11.catalog.json', import.meta.url), 'utf8'));

const existingSongIds = {
  rain: '5170a405-8fd2-474f-9952-7ae2f01be748',
  entrance: '00782938-2b33-44a8-8cf5-56e3162e20d8',
  kyrie: '0bd1553f-69c8-4996-a92a-866e7be04e2b',
  psalm: 'b5ec99df-ed31-432b-8160-f7df64384ef4',
  holy: '9d194953-0e27-4c98-a1b9-1a7421e3e9ba',
  lamb: 'b0f85ce1-70d6-48a3-a95c-53912ff83f91',
  communion: '73156f65-42d4-4cc8-806b-e7f85e07a61a',
  body: 'fb7c1eaf-49c9-42d5-b6b3-08fbf37de5a8',
  final: '66780b55-f2b6-470c-bd03-0d5a77c39feb',
};

function contentHash(item) {
  return createHash('sha256').update(JSON.stringify({
    title: item.title.trim(),
    author: item.author.trim(),
    defaultKey: item.defaultKey.trim(),
    liturgicalMoments: [...item.liturgicalMoments].map((value) => value.trim()).sort(),
    lyrics: item.lyrics.trim(),
    chords: item.chords.trim(),
  })).digest('hex');
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');
  const catalogSongIds = {};
  for (const item of catalog.items) {
    const match = await client.query(
      `SELECT id FROM songs WHERE parish_id=$1 AND lower(trim(title))=lower(trim($2))
        AND lower(trim(author))=lower(trim($3)) AND status='ACTIVE'`,
      [PARISH_ID, item.title, item.author],
    );
    const values = [
      item.title, item.author, item.defaultKey, JSON.stringify(item.liturgicalMoments), item.lyrics, item.chords,
      item.youtubeUrl ?? null, item.rights.status, item.rights.type, item.rights.attribution,
      contentHash(item), item.rights.reviewedAt,
    ];
    let songId;
    if (match.rowCount) {
      songId = match.rows[0].id;
      await client.query(
        `UPDATE songs SET title=$1,author=$2,default_key=$3,liturgical_moments=$4::jsonb,
          lyrics=$5,chords=$6,content_mode='INTERNAL',external_url=NULL,youtube_url=coalesce($7,youtube_url),
          rights_status=$8,rights_type=$9,source_url=NULL,proof_url=NULL,attribution=$10,content_hash=$11,
          rights_reviewed_at=$12,chords_reviewed=true,chords_reviewed_at=now(),updated_at=now() WHERE id=$13`,
        [...values, songId],
      );
    } else {
      songId = (
        await client.query(
          `INSERT INTO songs(parish_id,title,author,default_key,liturgical_moments,lyrics,chords,content_mode,
            youtube_url,status,rights_status,rights_type,attribution,content_hash,rights_reviewed_at,chords_reviewed,chords_reviewed_at)
           VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'INTERNAL',$8,'ACTIVE',$9,$10,$11,$12,$13,true,now()) RETURNING id`,
          [PARISH_ID, ...values],
        )
      ).rows[0].id;
    }
    catalogSongIds[item.externalId] = songId;
    await client.query(
      `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'SYNC_REVIEWED_SONG_CHORDS','SONG',$3,$4::jsonb)`,
      [PARISH_ID, ACTOR_USER_ID, songId, JSON.stringify({ sourceDocument: item.rights.sourceDocument })],
    );
  }

  const desired = [
    [existingSongIds.rain, 'C', 'Acolhida'],
    [existingSongIds.entrance, 'E', 'Entrada'],
    [existingSongIds.kyrie, 'Bm', 'Ato penitencial'],
    [existingSongIds.psalm, 'A', 'Salmo'],
    [catalogSongIds['guadalupe-2026-11-11-aleluia-jmj'], 'D', 'Aclamação'],
    [catalogSongIds['guadalupe-2026-11-11-pao-e-vinho'], 'A', 'Ofertório'],
    [existingSongIds.holy, 'Em', 'Santo'],
    [catalogSongIds['guadalupe-2026-11-11-oracao-eucaristica'], 'Am', 'Oração eucarística'],
    [existingSongIds.lamb, 'G', 'Cordeiro'],
    [existingSongIds.communion, 'C', 'Comunhão'],
    [existingSongIds.body, 'F', 'Comunhão'],
    [existingSongIds.final, 'C', 'Final'],
  ];

  await client.query('UPDATE setlist_items SET position=position+100 WHERE occurrence_id=$1', [OCCURRENCE_ID]);
  for (const [index, [songId, key, moment]] of desired.entries()) {
    const current = await client.query(
      'SELECT id FROM setlist_items WHERE occurrence_id=$1 AND song_id=$2',
      [OCCURRENCE_ID, songId],
    );
    if (current.rowCount) {
      await client.query(
        'UPDATE setlist_items SET position=$1,key=$2,liturgical_moment=$3 WHERE id=$4',
        [index + 1, key, moment, current.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO setlist_items(occurrence_id,song_id,position,key,liturgical_moment,lyrics_snapshot)
         SELECT $1,id,$2,$3,$4,lyrics FROM songs WHERE id=$5`,
        [OCCURRENCE_ID, index + 1, key, moment, songId],
      );
    }
  }
  const desiredIds = desired.map(([songId]) => songId);
  await client.query(
    'DELETE FROM setlist_items WHERE occurrence_id=$1 AND NOT (song_id=ANY($2::uuid[]))',
    [OCCURRENCE_ID, desiredIds],
  );
  await client.query('UPDATE occurrences SET version=version+1,updated_at=now() WHERE id=$1 AND parish_id=$2', [OCCURRENCE_ID, PARISH_ID]);
  await client.query(
    `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'REPLACE_SETLIST_FROM_PARISH_PDF','OCCURRENCE',$3,$4::jsonb)`,
    [PARISH_ID, ACTOR_USER_ID, OCCURRENCE_ID, JSON.stringify({ sourceDocument: 'MISSA NOVEMBRO GUADALUPE.pdf', songIds: desiredIds })],
  );
  await client.query('COMMIT');

  const result = await client.query(
    `SELECT si.position,si.liturgical_moment,si.key,s.id AS song_id,s.title,s.author,s.chords_reviewed
       FROM setlist_items si JOIN songs s ON s.id=si.song_id
      WHERE si.occurrence_id=$1 ORDER BY si.position`,
    [OCCURRENCE_ID],
  );
  console.log(JSON.stringify({ updated: result.rows }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
