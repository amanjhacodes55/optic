import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// One connection per server process. SQLite in WAL mode handles many readers and a single
// writer, which is exactly the shape of an analytics workload (tiny writes, heavy reads).

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  api_key     TEXT NOT NULL,
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL,
  visitor_id      TEXT NOT NULL,
  user_id         TEXT,
  started_at      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  entry_page      TEXT,
  exit_page       TEXT,
  referrer        TEXT,
  referrer_domain TEXT,
  channel         TEXT NOT NULL DEFAULT 'Direct',
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  country         TEXT,
  language        TEXT,
  device          TEXT,
  browser         TEXT,
  os              TEXT,
  screen          TEXT,
  platform        TEXT NOT NULL DEFAULT 'web',
  pageviews       INTEGER NOT NULL DEFAULT 0,
  events          INTEGER NOT NULL DEFAULT 0,
  engaged_ms      INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,
  revenue         REAL NOT NULL DEFAULT 0,
  is_new          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sessions_site_time ON sessions(site_id, started_at);
CREATE INDEX IF NOT EXISTS sessions_visitor ON sessions(site_id, visitor_id, last_seen);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  visitor_id  TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  type        TEXT NOT NULL,          -- pageview | event | page_leave | error | vital
  name        TEXT NOT NULL,          -- 'pageview' for pageviews, event name otherwise
  path        TEXT,
  title       TEXT,
  props       TEXT,                   -- JSON object of custom properties
  revenue     REAL,
  value       REAL                    -- numeric payload: scroll depth %, vital value, engaged ms
);
CREATE INDEX IF NOT EXISTS events_site_time ON events(site_id, ts);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS events_site_name ON events(site_id, name, ts);

CREATE TABLE IF NOT EXISTS clicks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  path        TEXT NOT NULL,
  x           REAL NOT NULL,          -- fraction of document width, 0..1
  y           INTEGER NOT NULL,       -- px from the top of the document
  vw          INTEGER NOT NULL,       -- viewport width the click happened at
  selector    TEXT,
  rage        INTEGER NOT NULL DEFAULT 0,
  dead        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS clicks_site_path ON clicks(site_id, path, ts);

CREATE TABLE IF NOT EXISTS recordings (
  id          TEXT PRIMARY KEY,
  site_id     TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  path        TEXT,
  started_at  INTEGER NOT NULL,
  last_at     INTEGER NOT NULL,
  bytes       INTEGER NOT NULL DEFAULT 0,
  chunks      INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  rage_clicks INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS recordings_site_time ON recordings(site_id, started_at);

CREATE TABLE IF NOT EXISTS recording_chunks (
  recording_id TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  data         BLOB NOT NULL,         -- gzip of a JSON array of rrweb events
  PRIMARY KEY (recording_id, seq)
);

CREATE TABLE IF NOT EXISTS goals (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id   TEXT NOT NULL,
  name      TEXT NOT NULL,
  kind      TEXT NOT NULL,            -- event | page
  match     TEXT NOT NULL,            -- event name, or a page path (supports * wildcard)
  value     REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS funnels (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id   TEXT NOT NULL,
  name      TEXT NOT NULL,
  steps     TEXT NOT NULL             -- JSON [{label, kind: page|event, match}]
);

CREATE TABLE IF NOT EXISTS tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id   TEXT NOT NULL,
  kind      TEXT NOT NULL,            -- click | submit | pageview | script
  match     TEXT NOT NULL,            -- CSS selector, page path pattern or script URL
  event     TEXT,                     -- event name to send (not used by script tags)
  consent   TEXT NOT NULL DEFAULT 'analytics',
  enabled   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS salts (
  day   TEXT PRIMARY KEY,
  salt  TEXT NOT NULL
);
`;

declare global {
  var __opticDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (globalThis.__opticDb) return globalThis.__opticDb;
  const file = process.env.OPTIC_DB ?? path.join(process.cwd(), "data", "optic.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL");
  conn.pragma("synchronous = NORMAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(SCHEMA);
  conn.pragma("optimize"); // refresh planner statistics when they are stale; cheap when they are not
  globalThis.__opticDb = conn;
  return conn;
}

/** Test helper: swap in a fresh in-memory database. */
export function resetDbForTests(): Database.Database {
  globalThis.__opticDb?.close();
  globalThis.__opticDb = undefined;
  process.env.OPTIC_DB = ":memory:";
  return db();
}
