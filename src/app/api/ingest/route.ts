import { z } from "zod";
import { handleError, rateLimited, readJson } from "@/lib/http";
import { ingest, type Envelope } from "@/lib/ingest";
import { getSite } from "@/lib/sites";

// Server-to-server ingestion for data that never touches a browser: mobile apps, back-end
// conversions, CRM deals, point-of-sale orders, offline campaigns. Authenticated with the
// site's API key; events may carry their own timestamps (up to 90 days back).
const ServerEvent = z.object({
  type: z.enum(["pageview", "event"]).default("event"),
  name: z.string().max(120).optional(),
  url: z.string().max(2048).default("/"),
  referrer: z.string().max(2048).optional(),
  title: z.string().max(300).optional(),
  timestamp: z.union([z.number().int(), z.string()]).optional(),
  user_id: z.string().max(128).optional(),
  client_id: z.string().max(64).optional(),
  revenue: z.number().finite().optional(),
  props: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  platform: z.enum(["web", "ios", "android", "server", "pos", "crm", "offline"]).default("server"),
  country: z.string().length(2).optional(),
  user_agent: z.string().max(500).optional(),
});
const Body = z.object({ site: z.string(), events: z.array(ServerEvent).min(1).max(1000) });

const MAX_AGE = 90 * 86_400_000;

export async function POST(request: Request) {
  try {
    const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const body = Body.parse(await readJson(request, 2_000_000));
    const site = await getSite(body.site);
    if (!site || !key || site.api_key !== key) return Response.json({ error: "invalid site or API key" }, { status: 401 });
    if (rateLimited("ingest:" + site.id, 120)) return Response.json({ error: "rate limited" }, { status: 429 });

    const now = Date.now();
    const rejected: { index: number; reason: string }[] = [];
    // Events from the same person, platform and device go to the pipeline together, in order, as
    // the browser tracker sends them. Different people are independent, so a few groups run at
    // once: a request can carry 1000 events, and each pipeline call talks to the database.
    const groups = new Map<string, { env: Envelope; userAgent: string; country: string | null }>();
    body.events.forEach((e, index) => {
      if (!e.user_id && !e.client_id) return rejected.push({ index, reason: "user_id or client_id is required" });
      const ts = e.timestamp == null ? now : typeof e.timestamp === "number" ? e.timestamp : Date.parse(e.timestamp);
      if (!Number.isFinite(ts) || ts < now - MAX_AGE) return rejected.push({ index, reason: "timestamp missing or older than 90 days" });
      const country = e.country?.toUpperCase() ?? null;
      const key = JSON.stringify([e.user_id, e.client_id, e.platform, e.user_agent, country]);
      let group = groups.get(key);
      if (!group) {
        group = { env: { s: site.id, uid: e.user_id ?? null, cid: e.client_id ?? null, pf: e.platform, e: [] }, userAgent: e.user_agent ?? "", country };
        groups.set(key, group);
      }
      group.env.e.push({ t: e.type, n: e.name, u: e.url, r: e.referrer ?? null, ti: e.title ?? null, p: e.props, rev: e.revenue, ts });
    });
    let accepted = 0;
    const queue = [...groups.values()];
    await Promise.all(
      Array.from({ length: Math.min(8, queue.length) }, async () => {
        for (let g = queue.shift(); g; g = queue.shift()) {
          accepted += (await ingest(g.env, { ip: "server", userAgent: g.userAgent, country: g.country, now, trustTimestamps: true })).accepted;
        }
      }),
    );
    return Response.json({ accepted, rejected }, { status: rejected.length && !accepted ? 400 : 202 });
  } catch (err) {
    return handleError(err);
  }
}
