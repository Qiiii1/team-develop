import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema.js';

export function openDatabase(path: string, migrationsPath = resolve('backend/migrations')) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  try {
    chmodSync(path, 0o600);
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: migrationsPath });
    return { db, sqlite };
  } catch (error) { sqlite.close(); throw error; }
}
