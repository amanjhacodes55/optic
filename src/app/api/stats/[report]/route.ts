import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleError } from "@/lib/http";
import { parseContext, QueryError, SESSION_DIMENSIONS, type SessionDimension } from "@/lib/query/context";
import { insights } from "@/lib/query/insights";
import * as r from "@/lib/query/reports";
import { getSite } from "@/lib/sites";

// One endpoint per report: GET /api/stats/<report>?site=…&from=YYYY-MM-DD&to=YYYY-MM-DD&f=dim:value
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stats/[report]">) {
  try {
    const { report } = await ctx.params;
    const params = request.nextUrl.searchParams;

    if (report === "realtime") {
      const site = getSite(params.get("site") ?? "");
      if (!site) throw new QueryError("unknown site", 404);
      return Response.json(r.realtime(site.id));
    }

    const q = parseContext(params);
    switch (report) {
      case "overview":
        return Response.json(r.overview(q));
      case "breakdown":
        return Response.json(r.breakdown(q, params.get("dim") ?? "channel", Number(params.get("limit") ?? 50)));
      case "event":
        return Response.json(r.eventProperties(q, params.get("name") ?? ""));
      case "funnel": {
        let steps: r.FunnelStep[];
        const id = params.get("id");
        if (id) {
          const row = db().prepare("SELECT steps FROM funnels WHERE id = ? AND site_id = ?").get(id, q.site.id) as { steps: string } | undefined;
          if (!row) throw new QueryError("funnel not found", 404);
          steps = JSON.parse(row.steps);
        } else {
          steps = JSON.parse(params.get("steps") ?? "[]");
        }
        const by = params.get("by");
        return Response.json(r.funnel(q, steps, by && by in SESSION_DIMENSIONS ? (by as SessionDimension) : undefined));
      }
      case "paths":
        return Response.json(r.paths(q, params.get("start") ?? undefined));
      case "cohorts":
        return Response.json(r.cohorts(q, Number(params.get("weeks") ?? 8)));
      case "ecommerce":
        return Response.json(r.ecommerce(q));
      case "goals":
        return Response.json(r.goals(q));
      case "explore":
        return Response.json(
          r.explore(q, params.getAll("dim"), params.getAll("metric"), params.get("sort") ?? undefined, Number(params.get("limit") ?? 200)),
        );
      case "heatmap":
        return Response.json(r.heatmap(q, params.get("path") ?? "/", params.get("device") === "mobile" ? "mobile" : "desktop"));
      case "recordings":
        return Response.json(r.recordings(q, { frustrated: params.get("frustrated") === "1", path: params.get("path") ?? undefined }));
      case "recording":
        return Response.json(r.recording(q.site.id, params.get("id") ?? ""));
      case "insights": {
        const m = params.get("metric");
        return Response.json(insights(q, m === "visitors" || m === "conversions" || m === "revenue" ? m : "sessions"));
      }
      default:
        throw new QueryError("unknown report", 404);
    }
  } catch (err) {
    return handleError(err);
  }
}
