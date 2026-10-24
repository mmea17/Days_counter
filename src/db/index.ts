import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.ts';

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

let isTablesEnsured = false;

export async function ensureTables(d1: D1Database): Promise<void> {
  if (isTablesEnsured) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      target_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      color TEXT NOT NULL DEFAULT 'emerald',
      reminder_preset TEXT NOT NULL DEFAULT '1_day_before',
      recurrence TEXT NOT NULL DEFAULT 'none',
      display_units TEXT NOT NULL DEFAULT 'days',
      last_notified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_events_target_date ON events(target_date);`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_push_subs_user_id ON push_subscriptions(user_id);`
  ];

  for (const sql of statements) {
    try {
      await d1.prepare(sql).run();
    } catch (e) {
      // Table already exists, ignore
    }
  }

  try {
    await d1.prepare("ALTER TABLE events ADD COLUMN display_units TEXT DEFAULT 'days';").run();
  } catch (e) {
    // Column already exists, ignore
  }

  isTablesEnsured = true;
}
