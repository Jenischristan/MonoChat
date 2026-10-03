import fs from 'node:fs';
import path from 'node:path';
import { getRawClient } from './client';

export async function runMigrations() {
  const client = getRawClient();
  if (!client) {
    throw new Error('Database client not initialized');
  }

  const check = await client.query<{ regclass: string | null }>("SELECT to_regclass('public.users') as regclass;");
  if (!check.rows[0]?.regclass) {
    const migrationFile = path.resolve(process.cwd(), 'drizzle/0000_conscious_roxanne_simpson.sql');
    if (fs.existsSync(migrationFile)) {
      const sqlContent = fs.readFileSync(migrationFile, 'utf-8');
      await client.exec(sqlContent);
      console.log('[MonoChat] Database schema migrated successfully.');
    } else {
      console.warn('[MonoChat] Migration file not found at:', migrationFile);
    }
  }
}

export async function seedIfEmpty() {
  // Empty seed — MonoChat initializes clean for real user onboarding
}
