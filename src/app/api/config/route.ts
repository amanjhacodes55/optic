import { db } from "@/lib/db";
import { countryFrom, EU_COUNTRIES } from "@/lib/geo";
import { CORS } from "@/lib/http";
import { getSite } from "@/lib/sites";

// What the tracker needs to know at load time: which features are on, whether this visitor must
// consent first, and the tag-manager rules to apply without touching the site's code.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const site = getSite(params.get("site") ?? "");
  if (!site) return Response.json({ error: "unknown site" }, { status: 404, headers: CORS });

  const country = countryFrom(request.headers, params.get("tz"));
  const consentRequired = site.settings.consent === "always" || (site.settings.consent === "eu" && (!country || EU_COUNTRIES.has(country)));
  const tags = db()
    .prepare("SELECT kind, match, event, consent FROM tags WHERE site_id = ? AND enabled = 1 ORDER BY id")
    .all(site.id);

  return Response.json(
    {
      identity: site.settings.identity,
      respectDnt: site.settings.respectDnt,
      consentRequired,
      heatmaps: site.settings.heatmaps,
      replay: site.settings.replay,
      stripParams: site.settings.stripParams,
      tags,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
