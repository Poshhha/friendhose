import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(filename) {
  if (filename !== ':memory:')
    mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  return db;
}
