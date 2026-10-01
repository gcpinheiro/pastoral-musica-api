import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Client } from 'pg';

const OPEN_RIGHTS_TYPES = new Set([
  'PUBLIC_DOMAIN',
  'CC0',
  'CC_BY',
  'CC_BY_SA',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function argument(name) {
  const option = `--${name}`;
  const index = process.argv.indexOf(option);
  if (index >= 0) return process.argv[index + 1];
  return process.argv.find((value) => value.startsWith(`${option}=`))?.slice(option.length + 1);
}

function positionalArguments() {
  const values = [];
  const args = process.argv.slice(2);
  const optionsWithValues = new Set(['--file', '--parish-id']);
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith('--')) {
      values.push(args[index]);
      continue;
    }
    if (optionsWithValues.has(args[index]) && args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
  }
  return values;
}

function fail(message) {
  throw new Error(message);
}

function canonical(item) {
  return JSON.stringify({
    title: item.title.trim(),
    author: item.author.trim(),
    defaultKey: item.defaultKey.trim(),
    liturgicalMoments: [...item.liturgicalMoments].map((value) => value.trim()).sort(),
    lyrics: item.lyrics.trim(),
    chords: item.chords.trim(),
  });
}

function hash(item) {
  return createHash('sha256').update(canonical(item)).digest('hex');
}

function validateCatalog(catalog) {
  if (!catalog || catalog.catalogVersion !== 1 || !Array.isArray(catalog.items))
    fail('O JSON precisa conter catalogVersion=1 e um array items.');
  const errors = [];
  const hashes = new Set();
  catalog.items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    for (const field of ['title', 'author', 'defaultKey', 'lyrics', 'chords'])
      if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${prefix}.${field} é obrigatório.`);
    if (!Array.isArray(item.liturgicalMoments) || item.liturgicalMoments.length === 0)
      errors.push(`${prefix}.liturgicalMoments precisa ter ao menos uma etapa.`);
    const rights = item.rights;
    if (!rights || rights.status !== 'APPROVED') errors.push(`${prefix}.rights.status deve ser APPROVED.`);
    if (!rights || !OPEN_RIGHTS_TYPES.has(rights.type)) errors.push(`${prefix}.rights.type deve ser PUBLIC_DOMAIN, CC0, CC_BY ou CC_BY_SA.`);
    for (const field of ['sourceUrl', 'proofUrl'])
      if (!rights?.[field] || !String(rights[field]).startsWith('https://')) errors.push(`${prefix}.rights.${field} deve ser uma URL HTTPS.`);
    for (const field of ['allowsStorage', 'allowsLyrics', 'allowsChords', 'allowsTransposition'])
      if (rights?.[field] !== true) errors.push(`${prefix}.rights.${field} precisa ser true.`);
    if (typeof item.title === 'string' && typeof item.author === 'string') {
      const contentHash = hash(item);
      if (hashes.has(contentHash)) errors.push(`${prefix} duplica outra música no mesmo lote.`);
      hashes.add(contentHash);
    }
  });
  if (errors.length) fail(errors.join('\n'));
}

async function main() {
  const positional = positionalArguments();
  if (process.argv.includes('--report')) {
    const parishId = argument('parish-id') ?? positional.find((value) => UUID.test(value));
    if (!parishId || !UUID.test(parishId)) fail('--parish-id precisa ser um UUID válido.');
    if (!process.env.DATABASE_URL) fail('DATABASE_URL não configurada.');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query(
        `SELECT moment AS "liturgicalMoment",
                count(*)::int AS total,
                count(*) FILTER (WHERE rights_status='APPROVED')::int AS approved
           FROM songs s
           CROSS JOIN LATERAL jsonb_array_elements_text(s.liturgical_moments) AS moment
          WHERE s.parish_id=$1
          GROUP BY moment
          ORDER BY moment`,
        [parishId],
      );
      console.log(JSON.stringify(result.rows, null, 2));
    } finally {
      await client.end();
    }
    return;
  }
  const file = argument('file') ?? positional.find((value) => !UUID.test(value)) ?? './catalog/songs.catalog.json';
  const catalog = JSON.parse(await readFile(file, 'utf8'));
  validateCatalog(catalog);
  if (process.argv.includes('--validate')) {
    console.log(`Catálogo válido: ${catalog.items.length} item(ns).`);
    return;
  }
  const parishId = argument('parish-id') ?? positional.find((value) => UUID.test(value));
  if (!parishId || !UUID.test(parishId)) fail('--parish-id precisa ser um UUID válido.');
  if (!process.env.DATABASE_URL) fail('DATABASE_URL não configurada.');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const batchId = randomUUID();
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    const parish = await client.query('SELECT 1 FROM parishes WHERE id=$1 AND status=\'ACTIVE\'', [parishId]);
    if (!parish.rowCount) fail('Paróquia não encontrada ou inativa.');
    for (const item of catalog.items) {
      const contentHash = hash(item);
      const existing = await client.query('SELECT id FROM songs WHERE parish_id=$1 AND content_hash=$2', [parishId, contentHash]);
      await client.query(
        `INSERT INTO songs(parish_id,title,author,default_key,liturgical_moments,lyrics,chords,status,rights_status,rights_type,source_url,proof_url,attribution,content_hash,import_batch_id,rights_reviewed_at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'ACTIVE',$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (parish_id,content_hash) DO UPDATE SET title=EXCLUDED.title,author=EXCLUDED.author,default_key=EXCLUDED.default_key,liturgical_moments=EXCLUDED.liturgical_moments,lyrics=EXCLUDED.lyrics,chords=EXCLUDED.chords,status='ACTIVE',rights_status=EXCLUDED.rights_status,rights_type=EXCLUDED.rights_type,source_url=EXCLUDED.source_url,proof_url=EXCLUDED.proof_url,attribution=EXCLUDED.attribution,import_batch_id=EXCLUDED.import_batch_id,rights_reviewed_at=EXCLUDED.rights_reviewed_at,updated_at=now()`,
        [parishId, item.title.trim(), item.author.trim(), item.defaultKey.trim(), JSON.stringify(item.liturgicalMoments), item.lyrics.trim(), item.chords.trim(), item.rights.status, item.rights.type, item.rights.sourceUrl, item.rights.proofUrl, item.rights.attribution, contentHash, batchId, item.rights.reviewedAt ?? new Date().toISOString()],
      );
      if (existing.rowCount) updated += 1;
      else inserted += 1;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({ batchId, inserted, updated, total: catalog.items.length }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
