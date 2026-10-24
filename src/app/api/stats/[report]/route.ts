import type { NextRequest } from "next/server";
import { one } from "@/lib/db";
import { handleError } from "@/lib/http";
import { parseContext, QueryError, SESSION_DIMENSIONS, type SessionDimension } from "@/lib/query/context";
import { insights } from "@/lib/query/insights";
import * as r from "@/lib/query/reports";
import { viewableSite } from "@/lib/access";
import { currentUser } from "@/lib/auth";

// One endpoint per report: GET /api/stats/<report>?site=…&from=YYYY-MM-DD&to=YYYY-MM-DD&f=dim:value
export async function GET(request: NextRequest, ctx: RouteContext<"/api/stats/[report]">) {
  try {
    const { report } = await ctx.params;
    const params = request.nextUrl.searchParams;

    const site = await viewableSite(params.get("site") ?? "", await currentUser(request));
    if (report === "realtime") return Response.json(await r.realtime(site.id));

    const q = await parseContext(params);
    switch (report) {
      case "overview":
        return Response.json(await r.overview(q));
      case "breakdown":
        return Response.json(await r.breakdown(q, params.get("dim") ?? "channel", Number(params.get("limit") ?? 50)));
      case "event":
        return Response.json(await r.eventProperties(q, params.get("name") ?? ""));
      case "funnel": {
        let steps: r.FunnelStep[];
        const id = params.get("id");
        if (id) {
          const row = await one<{ steps: string }>("SELECT steps FROM funnels WHERE id = ? AND site_id = ?", [id, q.site.id]);
          if (!row) throw new QueryError("funnel not found", 404);
          steps = JSON.parse(row.steps);
        } else {
          steps = JSON.parse(params.get("steps") ?? "[]");
        }
        const by = params.get("by");
        return Response.json(await r.funnel(q, steps, by && by in SESSION_DIMENSIONS ? (by as SessionDimension) : undefined));
      }
      case "paths":
        return Response.json(await r.paths(q, params.get("start") ?? undefined));
      case "cohorts":
        return Response.json(await r.cohorts(q, Number(params.get("weeks") ?? 8)));
      case "ecommerce":
        return Response.json(await r.ecommerce(q));
      case "goals":
        return Response.json(await r.goals(q));
      case "explore":
        return Response.json(
          await r.explore(q, params.getAll("dim"), params.getAll("metric"), params.get("sort") ?? undefined, Number(params.get("limit") ?? 200)),
        );
      case "heatmap":
        return Response.json(await r.heatmap(q, params.get("path") ?? "/", params.get("device") === "mobile" ? "mobile" : "desktop"));
      case "recordings":
        return Response.json(await r.recordings(q, { frustrated: params.get("frustrated") === "1", path: params.get("path") ?? undefined }));
      case "recording":
        return Response.json(await r.recording(q.site.id, params.get("id") ?? ""));
      case "insights": {
        const m = params.get("metric");
        return Response.json(await insights(q, m === "visitors" || m === "conversions" || m === "revenue" ? m : "sessions"));
      }
      default:
        throw new QueryError("unknown report", 404);
    }
  } catch (err) {
    return handleError(err);
  }
}
