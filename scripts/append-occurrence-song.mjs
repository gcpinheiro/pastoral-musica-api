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
const liturgicalMoment = argument('liturgical-moment');
const requestedKey = argument('key');

if (
  !parishId ||
  !occurrenceId ||
  !songId ||
  !actorUserId ||
  !liturgicalMoment
) {
  throw new Error(
    '--parish-id, --occurrence-id, --song-id, --actor-user-id e --liturgical-moment são obrigatórios.',
  );
}
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
  if (occurrence.rowCount !== 1)
    throw new Error('Escala ativa não encontrada.');

  const song = await client.query(
    `SELECT id,title,default_key,lyrics FROM songs
      WHERE id=$1 AND parish_id=$2 AND status='ACTIVE'`,
    [songId, parishId],
  );
  if (song.rowCount !== 1) throw new Error('Música ativa não encontrada.');

  const positions = await client.query(
    `SELECT coalesce(max(position),0)::int AS last_position
       FROM setlist_items
      WHERE occurrence_id=$1`,
    [occurrenceId],
  );
  const lastPosition = positions.rows[0].last_position;
  const existing = await client.query(
    `SELECT id,position,key,liturgical_moment
       FROM setlist_items
      WHERE occurrence_id=$1 AND song_id=$2`,
    [occurrenceId, songId],
  );

  if (existing.rowCount) {
    if (existing.rowCount !== 1 || existing.rows[0].position !== lastPosition) {
      throw new Error(
        'A música já está na escala, mas não ocupa exclusivamente a última posição.',
      );
    }
    await client.query('COMMIT');
    process.stdout.write(
      `${JSON.stringify(
        {
          occurrenceId,
          song: song.rows[0].title,
          item: existing.rows[0],
          replayed: true,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const key = requestedKey ?? song.rows[0].default_key;
    const item = await client.query(
      `INSERT INTO setlist_items(
         occurrence_id,song_id,position,key,liturgical_moment,notes,lyrics_snapshot,formatted_lyrics
       ) VALUES($1,$2,$3,$4,$5,NULL,$6,NULL)
       RETURNING id,position,key,liturgical_moment,length(lyrics_snapshot)::int AS lyrics_length`,
      [
        occurrenceId,
        songId,
        lastPosition + 1,
        key,
        liturgicalMoment,
        song.rows[0].lyrics,
      ],
    );

    await client.query(
      'UPDATE occurrences SET version=version+1,updated_at=now() WHERE id=$1',
      [occurrenceId],
    );
    await client.query(
      `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,$2,'ADD_SETLIST_SONG','OCCURRENCE',$3,$4::jsonb)`,
      [
        parishId,
        actorUserId,
        occurrenceId,
        JSON.stringify({
          songId,
          key,
          liturgicalMoment,
          setlistItemId: item.rows[0].id,
        }),
      ],
    );

    await client.query('COMMIT');
    process.stdout.write(
      `${JSON.stringify(
        {
          occurrenceId,
          song: song.rows[0].title,
          item: item.rows[0],
          replayed: false,
        },
        null,
        2,
      )}\n`,
    );
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
