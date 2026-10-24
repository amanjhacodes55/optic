import { createClient, type Client, type InArgs, type InStatement, type Transaction } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

// SQLite through libSQL. With TURSO_DATABASE_URL set it talks to a hosted Turso database, which
// is what serverless hosts such as Netlify need: they have no disk that outlives a request.
// Without it, it uses a local file, as before, so self-hosting and development need no account.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sites (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  api_key     TEXT NOT NULL,
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  owner_id    TEXT,                   -- user who owns the site; NULL for the bundled demo
  public      INTEGER NOT NULL DEFAULT 0 -- 1: anyone can view the dashboards, read-only
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash  TEXT PRIMARY KEY,       -- sha256 of the cookie token; the token itself is never stored
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);

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
  var __opticDb: Promise<Client> | undefined;
}

export type Row = Record<string, unknown>;
export type Tx = Pick<Transaction, "execute">;

/** The shared client, created and migrated on first use. */
export function db(): Promise<Client> {
  globalThis.__opticDb ??= open();
  return globalThis.__opticDb;
}

async function open(): Promise<Client> {
  const remote = process.env.TURSO_DATABASE_URL;
  let url = remote;
  if (!url) {
    const file = process.env.OPTIC_DB ?? path.join(process.cwd(), "data", "optic.db");
    if (file === ":memory:") url = ":memory:";
    else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      url = "file:" + file;
    }
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
  if (!remote && url !== ":memory:") {
    // A local file serves many readers and one writer, the shape of an analytics workload.
    await client.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  }
  await migrate(client);
  await client.executeMultiple(SCHEMA);
  await client.execute("CREATE INDEX IF NOT EXISTS sites_owner ON sites(owner_id)");
  await client.execute("PRAGMA optimize").catch(() => {}); // refresh planner statistics; not every host allows it
  return client;
}

/** Upgrades databases created before accounts existed. */
async function migrate(client: Client) {
  const cols = (await client.execute("PRAGMA table_info(sites)")).rows as unknown as { name: string }[];
  if (!cols.length || cols.some((c) => c.name === "owner_id")) return;
  await client.batch(
    ["ALTER TABLE sites ADD COLUMN owner_id TEXT", "ALTER TABLE sites ADD COLUMN public INTEGER NOT NULL DEFAULT 0", "UPDATE sites SET public = 1 WHERE id = 'demo'"],
    "write",
  );
}

// libSQL rows carry extra index properties; React only passes plain objects from server to
// client components, so rows are copied into plain ones.
function plain<T>(rs: { columns: string[]; rows: ArrayLike<unknown>[] }): T[] {
  return rs.rows.map((r) => {
    const o: Row = {};
    rs.columns.forEach((c, i) => (o[c] = r[i]));
    return o as T;
  });
}

/** All rows of a query. */
export async function all<T = Row>(sql: string, args: InArgs = [], on?: Tx): Promise<T[]> {
  return plain<T>(await (on ?? (await db())).execute({ sql, args }));
}

/** The first row, or undefined. */
export async function one<T = Row>(sql: string, args: InArgs = [], on?: Tx): Promise<T | undefined> {
  return (await all<T>(sql, args, on))[0];
}

/** A write. Returns the number of rows changed. */
export async function run(sql: string, args: InArgs = [], on?: Tx): Promise<number> {
  return (await (on ?? (await db())).execute({ sql, args })).rowsAffected;
}

/** An insert. Returns the new row's id. */
export async function insert(sql: string, args: InArgs = []): Promise<number> {
  return Number((await (await db()).execute({ sql, args })).lastInsertRowid);
}

/** Several writes in one round trip, all or nothing. */
export async function batch(statements: InStatement[]): Promise<void> {
  if (statements.length) await (await db()).batch(statements, "write");
}

/** Test helper: swap in a fresh in-memory database. */
export async function resetDbForTests(): Promise<Client> {
  (await globalThis.__opticDb)?.close();
  globalThis.__opticDb = undefined;
  delete process.env.TURSO_DATABASE_URL;
  process.env.OPTIC_DB = ":memory:";
  return db();
}
