import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import fs from 'node:fs';
import path from 'node:path';

let client: PGlite | null = null;
let db: PgliteDatabase<typeof schema> | null = null;

export async function openDb() {
  if (!client) {
    const dataDir = process.env.DATABASE_DIR || path.resolve(process.cwd(), 'db');
    fs.mkdirSync(dataDir, { recursive: true });
    client = new PGlite(dataDir);
    await client.waitReady;
    db = drizzle(client, { schema });
  }
  return db;
}

export async function closeDb() {
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore close errors on shutdown
    }
    client = null;
    db = null;
  }
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call openDb() first.');
  }
  return db;
}

export function getRawClient(): PGlite | null {
  return client;
}
