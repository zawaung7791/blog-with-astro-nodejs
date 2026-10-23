import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH ?? './data/blog.db';

let db: Database.Database | undefined;

/** Opens the SQLite database (once per process) and creates tables if needed. */
export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    TEXT NOT NULL,
      author     TEXT NOT NULL,
      email      TEXT,
      body       TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      ip_hash    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS comments_post_status ON comments (post_id, status, created_at);
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      body       TEXT NOT NULL,
      ip_hash    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key          TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count        INTEGER NOT NULL
    );
  `);
  return db;
}

/** Random per-database salt, created on first use, so raw IPs are never stored. */
function getSalt(d: Database.Database): string {
  const row = d.prepare(`SELECT value FROM meta WHERE key = 'ip_salt'`).get() as { value: string } | undefined;
  if (row) return row.value;
  const salt = randomBytes(16).toString('hex');
  d.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('ip_salt', ?)`).run(salt);
  return (d.prepare(`SELECT value FROM meta WHERE key = 'ip_salt'`).get() as { value: string }).value;
}

export function hashIp(ip: string): string {
  const d = getDb();
  return createHash('sha256').update(getSalt(d)).update(ip).digest('hex').slice(0, 32);
}

/**
 * Fixed-window rate limit. Returns 0 if the request is allowed (and counts it),
 * otherwise the number of seconds until the window resets.
 */
export function rateLimit(key: string, max: number, windowSeconds: number): number {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  const run = d.transaction((): number => {
    const row = d.prepare(`SELECT window_start, count FROM rate_limits WHERE key = ?`).get(key) as
      | { window_start: number; count: number }
      | undefined;
    if (!row || now - row.window_start >= windowSeconds) {
      d.prepare(`INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)`).run(key, now);
      return 0;
    }
    if (row.count >= max) return row.window_start + windowSeconds - now;
    d.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).run(key);
    return 0;
  });
  // Opportunistic cleanup of long-expired windows.
  d.prepare(`DELETE FROM rate_limits WHERE window_start < ?`).run(now - 86400);
  return run.immediate();
}
