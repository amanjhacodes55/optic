import { countryFrom, clientIp } from "@/lib/geo";
import { CORS, handleError, rateLimited, readJson } from "@/lib/http";
import { Envelope, ingest } from "@/lib/ingest";
import { isBot } from "@/lib/ua";

// Browser tracker endpoint. The tracker posts with sendBeacon or fetch(keepalive) using a
// text/plain body, so no CORS preflight is needed.
export async function POST(request: Request) {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (isBot(ua)) return new Response(null, { status: 204, headers: CORS });
    const ip = clientIp(request.headers);
    if (rateLimited("collect:" + ip)) return Response.json({ error: "rate limited" }, { status: 429, headers: CORS });

    const env = Envelope.parse(await readJson(request, 256_000));
    const result = await ingest(env, { ip, userAgent: ua, country: countryFrom(request.headers, env.tz), now: Date.now() });
    return Response.json({ ok: true, accepted: result.accepted }, { status: 202, headers: CORS });
  } catch (err) {
    return handleError(err, CORS);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
