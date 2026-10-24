import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/http";
import { deleteSite, getSite, rotateApiKey, SiteSettings, updateSite } from "@/lib/sites";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/sites/[id]">) {
  const site = getSite((await ctx.params).id);
  return site ? Response.json(site) : Response.json({ error: "not found" }, { status: 404 });
}

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  domain: z.string().min(3).max(253).optional(),
  timezone: z.string().max(64).optional(),
  settings: SiteSettings.partial().optional(),
  rotateKey: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/sites/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = Patch.parse(await request.json());
    if (body.timezone) new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }); // throws on an unknown zone
    if (body.rotateKey) rotateApiKey(id);
    const site = updateSite(id, body);
    return site ? Response.json(site) : Response.json({ error: "not found" }, { status: 404 });
  } catch (err) {
    if (err instanceof RangeError) return Response.json({ error: "unknown time zone" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/sites/[id]">) {
  deleteSite((await ctx.params).id);
  return new Response(null, { status: 204 });
}
