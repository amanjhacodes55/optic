import { z } from "zod";
import { all, batch, one, run } from "./db";
import { randomId } from "./visitor";

export const SiteSettings = z.object({
  identity: z.enum(["cookieless", "persistent"]).default("cookieless"),
  respectDnt: z.boolean().default(false),
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

export async function getSite(id: string): Promise<Site | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 10_000) return hit.site;
  const row = await one<Row>("SELECT * FROM sites WHERE id = ?", [id]);
  const site = row ? hydrate(row) : null;
  cache.set(id, { site, at: Date.now() });
  return site;
}

/** The user's own sites first, then public ones (the demo). */
export async function listSites(userId: string | null): Promise<Site[]> {
  return (await all<Row>("SELECT * FROM sites WHERE owner_id = ? OR public = 1 ORDER BY (owner_id = ?) DESC, created_at", [userId ?? "", userId ?? ""])).map(hydrate);
}

export async function createSite(input: {
  name: string;
  domain: string;
  timezone?: string;
  id?: string;
  settings?: Partial<SiteSettings>;
  ownerId?: string | null;
  public?: boolean;
}): Promise<Site> {
  const id = input.id ?? randomId(6);
  const domain = input.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  await run("INSERT INTO sites(id, name, domain, timezone, api_key, settings, created_at, owner_id, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    id,
    input.name,
    domain,
    input.timezone ?? "UTC",
    "opk_" + randomId(18),
    JSON.stringify(SiteSettings.parse(input.settings ?? {})),
    Date.now(),
    input.ownerId ?? null,
    input.public ? 1 : 0,
  ]);
  cache.delete(id);
  return (await getSite(id))!;
}

export async function updateSite(id: string, patch: { name?: string; domain?: string; timezone?: string; settings?: Partial<SiteSettings> }): Promise<Site | null> {
  const site = await getSite(id);
  if (!site) return null;
  const settings = SiteSettings.parse({ ...site.settings, ...patch.settings });
  await run("UPDATE sites SET name = ?, domain = ?, timezone = ?, settings = ? WHERE id = ?", [
    patch.name ?? site.name,
    patch.domain ?? site.domain,
    patch.timezone ?? site.timezone,
    JSON.stringify(settings),
    id,
  ]);
  cache.delete(id);
  return getSite(id);
}

export async function rotateApiKey(id: string): Promise<string> {
  const key = "opk_" + randomId(18);
  await run("UPDATE sites SET api_key = ? WHERE id = ?", [key, id]);
  cache.delete(id);
  return key;
}

export async function deleteSite(id: string): Promise<void> {
  await batch([
    ...["events", "clicks", "sessions", "goals", "funnels", "tags"].map((t) => ({ sql: `DELETE FROM ${t} WHERE site_id = ?`, args: [id] })),
    { sql: "DELETE FROM recording_chunks WHERE recording_id IN (SELECT id FROM recordings WHERE site_id = ?)", args: [id] },
    { sql: "DELETE FROM recordings WHERE site_id = ?", args: [id] },
    { sql: "DELETE FROM sites WHERE id = ?", args: [id] },
  ]);
  cache.delete(id);
}
