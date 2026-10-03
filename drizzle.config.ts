import { defineConfig } from 'drizzle-kit';

// No live dbCredentials needed: `drizzle-kit generate` is schema → SQL (offline).
// Migrations are applied programmatically by scripts/db-setup.ts (PGlite or DATABASE_URL).
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './drizzle',
});
