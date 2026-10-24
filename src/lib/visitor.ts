import crypto from "node:crypto";
import { batch, one } from "./db";

// Cookieless identity. The visitor id is a hash of a salt that changes every day, the site,
// the IP address and the user agent. Neither the IP nor the salt is ever stored next to the
// hash, and yesterday's salt is deleted, so a visitor cannot be followed across days or sites.
//
// Sites that opt into persistent identity (needed for retention and cohorts) send a random
// first-party id from the tracker instead; we still hash it with the site id before storing.

// Today's salt is looked up once per server instance, not once per event: on a hosted database
// every lookup is a network round trip.
const salts = new Map<string, string>();

async function dailySalt(day: string): Promise<string> {
  const known = salts.get(day);
  if (known) return known;
  let row = await one<{ salt: string }>("SELECT salt FROM salts WHERE day = ?", [day]);
  if (!row) {
    const salt = crypto.randomBytes(16).toString("hex");
    // Another instance may write the same day's salt at the same moment; the first one wins.
    await batch([
      { sql: "INSERT OR IGNORE INTO salts(day, salt) VALUES (?, ?)", args: [day, salt] },
      { sql: "DELETE FROM salts WHERE day < ?", args: [day] },
    ]);
    row = await one<{ salt: string }>("SELECT salt FROM salts WHERE day = ?", [day]);
  }
  salts.clear();
  salts.set(day, row!.salt);
  return row!.salt;
}

export function hash(...parts: string[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export async function visitorId(opts: {
  siteId: string;
  ip: string;
  userAgent: string;
  clientId?: string | null;
  userId?: string | null;
  now?: number;
}): Promise<string> {
  if (opts.userId) return hash("user", opts.siteId, opts.userId);
  if (opts.clientId) return hash("client", opts.siteId, opts.clientId);
  const day = new Date(opts.now ?? Date.now()).toISOString().slice(0, 10);
  return hash(await dailySalt(day), opts.siteId, opts.ip, opts.userAgent);
}

export function randomId(bytes = 12): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
