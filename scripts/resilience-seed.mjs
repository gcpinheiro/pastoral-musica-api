import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Client } = pg;
const email = process.env.TEST_EMAIL?.trim().toLowerCase();
const password = process.env.TEST_PASSWORD;

if (!email || !password || password === 'troque-esta-senha') {
  throw new Error('Defina TEST_EMAIL e uma TEST_PASSWORD segura em .env.resilience.');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN');
  const parish = await client.query(
    `INSERT INTO parishes(name,slug,city,state,timezone,status)
     VALUES('Paróquia de Teste de Resiliência','resilience-test','Fortaleza','CE','America/Fortaleza','ACTIVE')
     ON CONFLICT (slug) DO UPDATE SET status='ACTIVE',updated_at=now()
     RETURNING id`,
  );
  const parishId = parish.rows[0].id;
  const member = await client.query(
    `INSERT INTO members(parish_id,name,email,phone,status)
     VALUES($1,'Eury Teste de Resiliência',$2,'+5585999990000','ACTIVE')
     ON CONFLICT (parish_id,email) DO UPDATE SET status='ACTIVE',updated_at=now()
     RETURNING id`,
    [parishId, email],
  );
  const passwordHash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users(parish_id,member_id,name,email,password_hash,role,status)
     VALUES($1,$2,'Eury Teste de Resiliência',$3,$4,'LEADER','ACTIVE')
     ON CONFLICT (email) DO UPDATE
       SET parish_id=EXCLUDED.parish_id,member_id=EXCLUDED.member_id,
           password_hash=EXCLUDED.password_hash,role='LEADER',status='ACTIVE',updated_at=now()`,
    [parishId, member.rows[0].id, email, passwordHash],
  );
  await client.query('COMMIT');
  process.stdout.write('Conta de líder para o teste de resiliência preparada.\n');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
