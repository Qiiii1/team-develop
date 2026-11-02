import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite', schema: './backend/src/schema.ts', out: './backend/migrations',
  dbCredentials: { url: process.env.HARNESS_WEB_DB ?? '.local/web/team.db' },
});
