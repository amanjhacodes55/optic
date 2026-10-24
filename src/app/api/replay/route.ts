import zlib from "node:zlib";
import { z } from "zod";
import { batch, one } from "@/lib/db";
import { clientIp } from "@/lib/geo";
import { CORS, handleError, rateLimited, readJson } from "@/lib/http";
import { SESSION_TIMEOUT_MS } from "@/lib/ingest";
import { getSite } from "@/lib/sites";
import { isBot } from "@/lib/ua";
import { visitorId } from "@/lib/visitor";

const Chunk = z.object({
  s: z.string().max(64),
  rid: z.string().min(8).max(40),
  seq: z.number().int().min(0).max(100_000),
  u: z.string().max(2048),
  cid: z.string().max(64).optional().nullable(),
  uid: z.string().max(128).optional().nullable(),
  ev: z.array(z.unknown()).max(5000),
  clicks: z.number().int().min(0).optional(),
  rage: z.number().int().min(0).optional(),
  err: z.number().int().min(0).optional(),
});

// Session-replay chunks from rrweb. Each page load is one recording; it is tied to the session
// the pageview already opened, so replays inherit the session's device, source and country.
export async function POST(request: Request) {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (isBot(ua)) return new Response(null, { status: 204, headers: CORS });
    const ip = clientIp(request.headers);
    if (rateLimited("replay:" + ip, 300)) return Response.json({ error: "rate limited" }, { status: 429, headers: CORS });

    const c = Chunk.parse(await readJson(request, 2_000_000));
    const site = await getSite(c.s);
    if (!site || !site.settings.replay.enabled) return new Response(null, { status: 204, headers: CORS });

    const now = Date.now();
    const vid = await visitorId({ siteId: site.id, ip, userAgent: ua, clientId: c.cid, userId: c.uid, now });
    const session = await one<{ id: string }>(
      "SELECT id FROM sessions INDEXED BY sessions_visitor WHERE site_id = ? AND visitor_id = ? AND last_seen >= ? ORDER BY last_seen DESC LIMIT 1",
      [site.id, vid, now - SESSION_TIMEOUT_MS],
    );
    if (!session) return new Response(null, { status: 204, headers: CORS });

    let path = "/";
    try {
      path = new URL(c.u).pathname;
    } catch {}
    const data = zlib.gzipSync(JSON.stringify(c.ev));
    // One round trip. changes() is the row count of the statement before it, so the totals only
    // move when this chunk is new (a retried beacon is ignored).
    await batch([
      {
        sql: `INSERT INTO recordings(id, site_id, session_id, path, started_at, last_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
        args: [c.rid, site.id, session.id, path, now, now],
      },
      { sql: "INSERT OR IGNORE INTO recording_chunks(recording_id, seq, data) VALUES (?, ?, ?)", args: [c.rid, c.seq, data] },
      {
        sql: `UPDATE recordings SET last_at = ?, bytes = bytes + ?, chunks = chunks + 1, clicks = clicks + ?, rage_clicks = rage_clicks + ?, errors = errors + ?
              WHERE id = ? AND site_id = ? AND changes() > 0`,
        args: [now, data.length, c.clicks ?? 0, c.rage ?? 0, c.err ?? 0, c.rid, site.id],
      },
    ]);
    return Response.json({ ok: true }, { status: 202, headers: CORS });
  } catch (err) {
    return handleError(err, CORS);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
