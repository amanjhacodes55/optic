import type { NextRequest } from "next/server";
import { z } from "zod";
import { editableSite, publicView, viewableSite } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { handleError } from "@/lib/http";
import { deleteSite, rotateApiKey, SiteSettings, updateSite } from "@/lib/sites";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/sites/[id]">) {
  try {
    const user = currentUser(request);
    return Response.json(publicView(viewableSite((await ctx.params).id, user), user));
  } catch (err) {
    return handleError(err);
  }
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
    const user = currentUser(request);
    const site = editableSite((await ctx.params).id, user);
    const body = Patch.parse(await request.json());
    if (body.timezone) new Intl.DateTimeFormat("en-US", { timeZone: body.timezone }); // throws on an unknown zone
    if (body.rotateKey) rotateApiKey(site.id);
    return Response.json(publicView(updateSite(site.id, body)!, user));
  } catch (err) {
    if (err instanceof RangeError) return Response.json({ error: "unknown time zone" }, { status: 400 });
    return handleError(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/sites/[id]">) {
  try {
    deleteSite(editableSite((await ctx.params).id, currentUser(request)).id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
