import { z } from "zod";
import { db } from "./db";
import { classifyChannel, referrerDomain } from "./channel";
import { getSite, type Site } from "./sites";
import { parseUA } from "./ua";
import { randomId, visitorId } from "./visitor";

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Wire format. Keys are short because the tracker sends them on every page.
const Event = z.object({
  t: z.enum(["pageview", "event", "page_leave", "error", "vital", "click"]),
  n: z.string().max(120).optional(),
  u: z.string().max(2048),
  r: z.string().max(2048).optional().nullable(),
  ti: z.string().max(300).optional().nullable(),
  p: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  rev: z.number().finite().optional(),
  v: z.number().finite().optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(100_000).optional(),
  vw: z.number().int().min(0).max(10_000).optional(),
  sel: z.string().max(300).optional(),
  rage: z.boolean().optional(),
  dead: z.boolean().optional(),
  ts: z.number().int().optional(),
});
export type WireEvent = z.infer<typeof Event>;

export const Envelope = z.object({
  s: z.string().min(1).max(64),
  cid: z.string().max(64).optional().nullable(),
  uid: z.string().max(128).optional().nullable(),
  sw: z.number().int().optional(),
  sh: z.number().int().optional(),
  tz: z.string().max(64).optional().nullable(),
  lang: z.string().max(35).optional().nullable(),
  pf: z.enum(["web", "ios", "android", "server", "pos", "crm", "offline"]).optional(),
  e: z.array(Event).min(1).max(200),
});
export type Envelope = z.infer<typeof Envelope>;

export type RequestContext = {
  ip: string;
  userAgent: string;
  country: string | null;
  now: number;
  /** Server-side ingestion may backdate events; browser events always use server time. */
  trustTimestamps?: boolean;
};

type SessionRow = { id: string; last_seen: number; started_at: number };

function splitUrl(raw: string, site: Site) {
  let url: URL;
  try {
    url = new URL(raw, "https://" + site.domain);
  } catch {
    return { path: raw.slice(0, 500), utm: {} as Record<string, string> };
  }
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = url.searchParams.get(k);
    if (v) utm[k] = v.slice(0, 200);
  }
  if (!utm.utm_source) {
    if (url.searchParams.get("gclid")) Object.assign(utm, { utm_source: "google", utm_medium: "cpc" });
    else if (url.searchParams.get("fbclid")) Object.assign(utm, { utm_source: "facebook", utm_medium: "social" });
  }
  // Paths are stored without the query string, so PII in parameters never reaches the database.
  return { path: decodeURIComponent(url.pathname).slice(0, 500) || "/", utm };
}

const goalsCache = new Map<string, { at: number; goals: { kind: string; match: string; value: number }[] }>();

function goalsFor(siteId: string) {
  const hit = goalsCache.get(siteId);
  if (hit && Date.now() - hit.at < 10_000) return hit.goals;
  const goals = db().prepare("SELECT kind, match, value FROM goals WHERE site_id = ?").all(siteId) as { kind: string; match: string; value: number }[];
  goalsCache.set(siteId, { at: Date.now(), goals });
  return goals;
}
export function clearGoalsCache(siteId: string) {
  goalsCache.delete(siteId);
}

export function matchPath(pattern: string, path: string): boolean {
  if (!pattern.includes("*")) return pattern === path;
  const re = new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return re.test(path);
}


// Prepared once per connection; preparing on every request costs more than running the statements.
const prepared = new WeakMap<object, ReturnType<typeof prepare>>();
function statements(conn: ReturnType<typeof db>) {
  let q = prepared.get(conn);
  if (!q) {
    q = prepare(conn);
    prepared.set(conn, q);
  }
  return q;
}

function prepare(conn: ReturnType<typeof db>) {
  return {
    lastSession: conn.prepare("SELECT id, last_seen, started_at FROM sessions INDEXED BY sessions_visitor WHERE site_id = ? AND visitor_id = ? AND last_seen >= ? AND started_at <= ? ORDER BY last_seen DESC LIMIT 1"),
    anyEarlier: conn.prepare("SELECT 1 FROM sessions INDEXED BY sessions_visitor WHERE site_id = ? AND visitor_id = ? AND started_at < ? LIMIT 1"),
    newSession: conn.prepare(`INSERT INTO sessions(id, site_id, visitor_id, user_id, started_at, last_seen, entry_page, exit_page, referrer, referrer_domain,
      channel, utm_source, utm_medium, utm_campaign, utm_term, utm_content, country, language, device, browser, os, screen, platform, is_new)
      VALUES (@id, @site_id, @visitor_id, @user_id, @ts, @ts, @path, @path, @referrer, @referrer_domain, @channel, @utm_source, @utm_medium,
      @utm_campaign, @utm_term, @utm_content, @country, @language, @device, @browser, @os, @screen, @platform, @is_new)`),
    touch: conn.prepare("UPDATE sessions SET last_seen = MAX(last_seen, ?) WHERE id = ?"),
    pageview: conn.prepare("UPDATE sessions SET pageviews = pageviews + 1, exit_page = ?, last_seen = MAX(last_seen, ?) WHERE id = ?"),
    evt: conn.prepare("UPDATE sessions SET events = events + 1, revenue = revenue + ?, conversions = conversions + ?, last_seen = MAX(last_seen, ?) WHERE id = ?"),
    conv: conn.prepare("UPDATE sessions SET conversions = conversions + ? WHERE id = ?"),
    leave: conn.prepare("UPDATE sessions SET engaged_ms = engaged_ms + ?, last_seen = MAX(last_seen, ?) WHERE id = ?"),
    user: conn.prepare("UPDATE sessions SET user_id = ? WHERE id = ? AND user_id IS NULL"),
    insertEvent: conn.prepare("INSERT INTO events(site_id, session_id, visitor_id, ts, type, name, path, title, props, revenue, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
    insertClick: conn.prepare("INSERT INTO clicks(site_id, session_id, ts, path, x, y, vw, selector, rage, dead) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
  };
}

export function ingest(env: Envelope, ctx: RequestContext): { accepted: number; sessionId: string | null } {
  const site = getSite(env.s);
  if (!site) throw new IngestError("unknown site", 404);
  const conn = db();
  const ua = parseUA(ctx.userAgent, env.sw);
  const goals = goalsFor(site.id);

  const q = statements(conn);

  let sessionId: string | null = null;
  let accepted = 0;

  conn.transaction(() => {
    for (const e of env.e) {
      const ts = ctx.trustTimestamps && e.ts ? Math.min(e.ts, ctx.now + 60_000) : ctx.now;
      const vid = visitorId({ siteId: site.id, ip: ctx.ip, userAgent: ctx.userAgent, clientId: env.cid, userId: env.uid, now: ts });
      const { path, utm } = splitUrl(e.u, site);

      const current = q.lastSession.get(site.id, vid, ts - SESSION_TIMEOUT_MS, ts + SESSION_TIMEOUT_MS) as SessionRow | undefined;
      // A new campaign click starts a new session, as in GA4.
      const startsNew = !current || (e.t === "pageview" && utm.utm_campaign && current.last_seen < ts - 60_000);
      if (startsNew) {
        if (e.t === "page_leave" || e.t === "click") continue; // stray beacon from an expired session
        const refDomain = referrerDomain(e.r);
        const internal = refDomain && (refDomain === site.domain || refDomain.endsWith("." + site.domain));
        sessionId = randomId();
        q.newSession.run({
          id: sessionId,
          site_id: site.id,
          visitor_id: vid,
          user_id: env.uid ?? null,
          ts,
          path,
          referrer: internal ? null : (e.r ?? null),
          referrer_domain: internal ? null : refDomain,
          channel: classifyChannel({ referrerDomain: internal ? null : refDomain, siteDomain: site.domain, utmSource: utm.utm_source, utmMedium: utm.utm_medium }),
          utm_source: utm.utm_source ?? null,
          utm_medium: utm.utm_medium ?? null,
          utm_campaign: utm.utm_campaign ?? null,
          utm_term: utm.utm_term ?? null,
          utm_content: utm.utm_content ?? null,
          country: ctx.country,
          language: env.lang?.split("-")[0]?.toLowerCase() ?? null,
          device: env.pf && env.pf !== "web" && !ctx.userAgent ? null : ua.device,
          browser: ua.browser,
          os: ua.os,
          screen: env.sw && env.sh ? `${env.sw}x${env.sh}` : null,
          platform: env.pf ?? "web",
          is_new: q.anyEarlier.get(site.id, vid, ts) ? 0 : 1,
        });
      } else {
        sessionId = current.id;
      }
      if (env.uid) q.user.run(env.uid, sessionId);

      const props = e.p && Object.keys(e.p).length ? JSON.stringify(e.p) : null;
      switch (e.t) {
        case "pageview": {
          q.pageview.run(path, ts, sessionId);
          q.insertEvent.run(site.id, sessionId, vid, ts, "pageview", "pageview", path, e.ti ?? null, props, null, null);
          const hits = goals.filter((g) => g.kind === "page" && matchPath(g.match, path)).length;
          if (hits) q.conv.run(hits, sessionId);
          break;
        }
        case "event": {
          const name = (e.n ?? "event").slice(0, 120);
          const hits = goals.filter((g) => g.kind === "event" && g.match === name).length;
          q.evt.run(e.rev ?? 0, hits, ts, sessionId);
          q.insertEvent.run(site.id, sessionId, vid, ts, "event", name, path, e.ti ?? null, props, e.rev ?? null, e.v ?? null);
          break;
        }
        case "page_leave": {
          const engaged = Math.max(0, Math.min(e.v ?? 0, SESSION_TIMEOUT_MS));
          q.leave.run(engaged, ts, sessionId);
          q.insertEvent.run(site.id, sessionId, vid, ts, "page_leave", "page_leave", path, null, props, null, engaged);
          break;
        }
        case "error":
        case "vital": {
          q.touch.run(ts, sessionId);
          q.insertEvent.run(site.id, sessionId, vid, ts, e.t, (e.n ?? e.t).slice(0, 120), path, null, props, null, e.v ?? null);
          break;
        }
        case "click": {
          if (!site.settings.heatmaps || e.x == null || e.y == null) break;
          q.touch.run(ts, sessionId);
          q.insertClick.run(site.id, sessionId, ts, path, e.x, Math.round(e.y), e.vw ?? 0, e.sel ?? null, e.rage ? 1 : 0, e.dead ? 1 : 0);
          break;
        }
      }
      accepted++;
    }
  })();

  return { accepted, sessionId };
}

export class IngestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
