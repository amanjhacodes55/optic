import type { NextRequest } from "next/server";
import { z } from "zod";
import { all, insert, run } from "@/lib/db";
import { handleError } from "@/lib/http";
import { clearGoalsCache } from "@/lib/ingest";
import { editableSite, viewableSite } from "@/lib/access";
import { currentUser } from "@/lib/auth";

// CRUD for a site's goals, funnels and tag-manager rules: /api/sites/<id>/<goals|funnels|tags>

const Step = z.object({ label: z.string().min(1).max(80), kind: z.enum(["page", "event"]), match: z.string().min(1).max(300) });

const SCHEMAS = {
  goals: z.object({ name: z.string().min(1).max(80), kind: z.enum(["event", "page"]), match: z.string().min(1).max(300), value: z.number().min(0).default(0) }),
  funnels: z.object({ name: z.string().min(1).max(80), steps: z.array(Step).min(2).max(8) }),
  tags: z.object({
    kind: z.enum(["click", "submit", "pageview", "script"]),
    match: z.string().min(1).max(500),
    event: z.string().max(120).optional(),
    consent: z.enum(["necessary", "analytics", "marketing"]).default("analytics"),
    enabled: z.boolean().default(true),
  }),
} as const;
type Collection = keyof typeof SCHEMAS;

function resolve(collection: string): Collection | null {
  return collection in SCHEMAS ? (collection as Collection) : null;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/sites/[id]/[collection]">) {
  const { id, collection } = await ctx.params;
  const c = resolve(collection);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  try {
    await viewableSite(id, await currentUser(request));
  } catch (err) {
    return handleError(err);
  }
  const rows = await all(`SELECT * FROM ${c} WHERE site_id = ? ORDER BY id`, [id]);
  return Response.json(c === "funnels" ? rows.map((r) => ({ ...r, steps: JSON.parse(r.steps as string) })) : rows);
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/sites/[id]/[collection]">) {
  try {
    const { id, collection } = await ctx.params;
    const c = resolve(collection);
    if (!c) return Response.json({ error: "not found" }, { status: 404 });
    await editableSite(id, await currentUser(request));
    const body = SCHEMAS[c].parse(await request.json());
    let newId: number;
    if (c === "goals") {
      const g = body as z.infer<typeof SCHEMAS.goals>;
      newId = await insert("INSERT INTO goals(site_id, name, kind, match, value) VALUES (?, ?, ?, ?, ?)", [id, g.name, g.kind, g.match, g.value]);
      clearGoalsCache(id);
    } else if (c === "funnels") {
      const f = body as z.infer<typeof SCHEMAS.funnels>;
      newId = await insert("INSERT INTO funnels(site_id, name, steps) VALUES (?, ?, ?)", [id, f.name, JSON.stringify(f.steps)]);
    } else {
      const t = body as z.infer<typeof SCHEMAS.tags>;
      if (t.kind !== "script" && !t.event) return Response.json({ error: "event name is required" }, { status: 400 });
      if (t.kind === "script" && !/^https:\/\//.test(t.match)) return Response.json({ error: "script tags must use an https:// URL" }, { status: 400 });
      newId = await insert("INSERT INTO tags(site_id, kind, match, event, consent, enabled) VALUES (?, ?, ?, ?, ?, ?)", [
        id,
        t.kind,
        t.match,
        t.event ?? null,
        t.consent,
        t.enabled ? 1 : 0,
      ]);
    }
    return Response.json({ id: newId }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/sites/[id]/[collection]">) {
  const { id, collection } = await ctx.params;
  const c = resolve(collection);
  if (!c) return Response.json({ error: "not found" }, { status: 404 });
  try {
    await editableSite(id, await currentUser(request));
  } catch (err) {
    return handleError(err);
  }
  await run(`DELETE FROM ${c} WHERE site_id = ? AND id = ?`, [id, Number(request.nextUrl.searchParams.get("item"))]);
  if (c === "goals") clearGoalsCache(id);
  return new Response(null, { status: 204 });
}
