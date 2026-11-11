import 'dotenv/config';
import process from 'node:process';
import { Client } from 'pg';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const songId = argument('song-id');
const parishId = argument('parish-id');
const actorUserId = argument('actor-user-id');

if (!songId || !parishId || !actorUserId)
  throw new Error('--song-id, --parish-id e --actor-user-id são obrigatórios.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');
  const candidate = await client.query(
    `SELECT id,title,author FROM songs
      WHERE id=$1 AND parish_id=$2 AND status='ACTIVE'
      FOR UPDATE`,
    [songId, parishId],
  );
  if (candidate.rowCount !== 1) throw new Error('Música ativa não encontrada.');

  const song = candidate.rows[0];
  const usage = await client.query('SELECT count(*)::int AS total FROM setlist_items WHERE song_id=$1', [songId]);
  if (usage.rows[0].total !== 0) throw new Error('A música possui vínculos com escalas e não pode ser arquivada.');

  const activeCopies = await client.query(
    `SELECT count(*)::int AS total FROM songs
      WHERE parish_id=$1 AND status='ACTIVE' AND id<>$2
        AND lower(trim(title))=lower(trim($3))
        AND lower(trim(author))=lower(trim($4))`,
    [parishId, songId, song.title, song.author],
  );
  if (activeCopies.rows[0].total < 1) throw new Error('Nenhum outro registro ativo equivalente foi encontrado.');

  await client.query("UPDATE songs SET status='INACTIVE',updated_at=now() WHERE id=$1", [songId]);
  await client.query(
    `INSERT INTO audit_logs(parish_id,actor_user_id,action,entity_type,entity_id,details)
     VALUES($1,$2,'ARCHIVE_DUPLICATE_SONG','SONG',$3,$4::jsonb)`,
    [
      parishId,
      actorUserId,
      songId,
      JSON.stringify({ reason: 'Duplicado ativo sem vínculos, preservado como inativo.' }),
    ],
  );
  await client.query('COMMIT');
  console.log(JSON.stringify({ archived: song }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
