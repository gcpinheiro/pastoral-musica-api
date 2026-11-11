import 'dotenv/config';
import process from 'node:process';
import { Client } from 'pg';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const parishId = argument('parish-id');
const occurrenceId = argument('occurrence-id');
const songId = argument('song-id');
const actorUserId = argument('actor-user-id');
const requestedKey = argument('key');

if (!parishId || !occurrenceId || !songId || !actorUserId)
  throw new Error('--parish-id, --occurrence-id, --song-id e --actor-user-id são obrigatórios.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');
  const occurrence = await client.query(
    `SELECT id FROM occurrences
      WHERE id=$1 AND parish_id=$2 AND archived_at IS NULL
      FOR UPDATE`,
    [occurrenceId, parishId],
  );
  if (occurrence.rowCount !== 1) throw new Error('Escala ativa não encontrada.');

  const song = await client.query(
    `SELECT id,title,default_key,lyrics FROM songs
      WHERE id=$1 AND parish_id=$2 AND status='ACTIVE'`,
    [songId, parishId],
  );
  if (song.rowCount !== 1) throw new Error('Música ativa não encontrada.');

  const key = requestedKey ?? song.rows[0].default_key;
  const item = await client.query(
    `UPDATE setlist_items
        SET key=$1,lyrics_snapshot=$2,formatted_lyrics=NULL
      WHERE occurrence_id=$3 AND song_id=$4
      RETURNING id,position,key,liturgical_moment,length(lyrics_snapshot)::int AS lyrics_length`,
    [key, song.rows[0].lyrics, occurrenceId, songId],
  );
  if (item.rowCount !== 1) throw new Error('A música não foi encontrada uma única vez na escala informada.');

  await client.query('UPDATE occurrences SET version=version+1,updated_at=now() WHERE id=$1', [occurrenceId]);
  await client.query(
    `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'REFRESH_SETLIST_SONG','OCCURRENCE',$3,$4::jsonb)`,
    [
      parishId,
      actorUserId,
      occurrenceId,
      JSON.stringify({ songId, key, setlistItemId: item.rows[0].id }),
    ],
  );

  await client.query('COMMIT');
  console.log(JSON.stringify({ occurrenceId, song: song.rows[0].title, item: item.rows[0] }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
