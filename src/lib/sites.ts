import { z } from "zod";
import { db } from "./db";
import { randomId } from "./visitor";

export const SiteSettings = z.object({
  identity: z.enum(["cookieless", "persistent"]).default("cookieless"),
  respectDnt: z.boolean().default(true),
  consent: z.enum(["none", "eu", "always"]).default("none"),
  replay: z
    .object({
      enabled: z.boolean().default(true),
      sampleRate: z.number().min(0).max(1).default(1),
      maskInputs: z.boolean().default(true),
    })
    .default({ enabled: true, sampleRate: 1, maskInputs: true }),
  heatmaps: z.boolean().default(true),
  stripParams: z.array(z.string()).default(["email", "token", "password", "phone", "name"]),
  currency: z.string().default("USD"),
});
export type SiteSettings = z.infer<typeof SiteSettings>;

export type Site = {
  id: string;
  name: string;
  domain: string;
  timezone: string;
  api_key: string;
  settings: SiteSettings;
  created_at: number;
  owner_id: string | null;
  public: boolean;
};

type Row = Omit<Site, "settings" | "public"> & { settings: string; public: number };

const cache = new Map<string, { site: Site | null; at: number }>();

function hydrate(row: Row): Site {
  return { ...row, public: !!row.public, settings: SiteSettings.parse(JSON.parse(row.settings || "{}")) };
}

export function getSite(id: string): Site | null {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 10_000) return hit.site;
  const row = db().prepare("SELECT * FROM sites WHERE id = ?").get(id) as Row | undefined;
  const site = row ? hydrate(row) : null;
  cache.set(id, { site, at: Date.now() });
  return site;
}

/** The user's own sites first, then public ones (the demo). */
export function listSites(userId: string | null): Site[] {
  return (
    db().prepare("SELECT * FROM sites WHERE owner_id = ? OR public = 1 ORDER BY (owner_id = ?) DESC, created_at").all(userId ?? "", userId ?? "") as Row[]
  ).map(hydrate);
}

export function createSite(input: {
  name: string;
  domain: string;
  timezone?: string;
  id?: string;
  settings?: Partial<SiteSettings>;
  ownerId?: string | null;
  public?: boolean;
}): Site {
  const id = input.id ?? randomId(6);
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  db()
    .prepare("INSERT INTO sites(id, name, domain, timezone, api_key, settings, created_at, owner_id, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.name, domain, input.timezone ?? "UTC", "opk_" + randomId(18), JSON.stringify(SiteSettings.parse(input.settings ?? {})), Date.now(), input.ownerId ?? null, input.public ? 1 : 0);
  cache.delete(id);
  return getSite(id)!;
}

export function updateSite(id: string, patch: { name?: string; domain?: string; timezone?: string; settings?: Partial<SiteSettings> }): Site | null {
  const site = getSite(id);
  if (!site) return null;
  const settings = SiteSettings.parse({ ...site.settings, ...patch.settings });
  db()
    .prepare("UPDATE sites SET name = ?, domain = ?, timezone = ?, settings = ? WHERE id = ?")
    .run(patch.name ?? site.name, patch.domain ?? site.domain, patch.timezone ?? site.timezone, JSON.stringify(settings), id);
  cache.delete(id);
  return getSite(id);
}

export function rotateApiKey(id: string): string {
  const key = "opk_" + randomId(18);
  db().prepare("UPDATE sites SET api_key = ? WHERE id = ?").run(key, id);
  cache.delete(id);
  return key;
}

export function deleteSite(id: string): void {
  const conn = db();
  conn.transaction(() => {
    for (const t of ["events", "clicks", "sessions", "goals", "funnels", "tags"]) conn.prepare(`DELETE FROM ${t} WHERE site_id = ?`).run(id);
    conn.prepare("DELETE FROM recording_chunks WHERE recording_id IN (SELECT id FROM recordings WHERE site_id = ?)").run(id);
    conn.prepare("DELETE FROM recordings WHERE site_id = ?").run(id);
    conn.prepare("DELETE FROM sites WHERE id = ?").run(id);
  })();
  cache.delete(id);
}
