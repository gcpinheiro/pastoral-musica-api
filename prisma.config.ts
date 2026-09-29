import 'dotenv/config';
import { defineConfig } from 'prisma/config';

process.env.DATABASE_URL ??=
  'postgresql://musica_app:change-me@127.0.0.1:5432/musica_da_gloria';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url:
      process.env.DATABASE_URL,
  },
});
