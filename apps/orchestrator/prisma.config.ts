import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Generation does not need a database; migration commands require this URL.
  datasource: { url: process.env.DATABASE_URL },
});
