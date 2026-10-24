import crypto from "node:crypto";
import { db } from "./db";

// Cookieless identity. The visitor id is a hash of a salt that changes every day, the site,
// the IP address and the user agent. Neither the IP nor the salt is ever stored next to the
// hash, and yesterday's salt is deleted, so a visitor cannot be followed across days or sites.
//
// Sites that opt into persistent identity (needed for retention and cohorts) send a random
// first-party id from the tracker instead; we still hash it with the site id before storing.

function dailySalt(day: string): string {
  const conn = db();
  const row = conn.prepare("SELECT salt FROM salts WHERE day = ?").get(day) as { salt: string } | undefined;
  if (row) return row.salt;
  const salt = crypto.randomBytes(16).toString("hex");
  conn.prepare("INSERT OR IGNORE INTO salts(day, salt) VALUES (?, ?)").run(day, salt);
  conn.prepare("DELETE FROM salts WHERE day < ?").run(day);
  return (conn.prepare("SELECT salt FROM salts WHERE day = ?").get(day) as { salt: string }).salt;
}

export function hash(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export function visitorId(opts: {
  siteId: string;
  ip: string;
  userAgent: string;
  clientId?: string | null;
  userId?: string | null;
  now?: number;
}): string {
  if (opts.userId) return hash("user", opts.siteId, opts.userId);
  if (opts.clientId) return hash("client", opts.siteId, opts.clientId);
  const day = new Date(opts.now ?? Date.now()).toISOString().slice(0, 10);
  return hash(dailySalt(day), opts.siteId, opts.ip, opts.userAgent);
}

export function randomId(bytes = 12): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
