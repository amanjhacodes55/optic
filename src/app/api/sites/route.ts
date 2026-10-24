import { connection } from "next/server";
import { z } from "zod";
import { publicView } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { handleError } from "@/lib/http";
import { createSite, listSites } from "@/lib/sites";

export async function GET(request: Request) {
  await connection(); // per-request data: opt out of build-time prerendering explicitly
  const user = await currentUser(request);
  return Response.json((await listSites(user?.id ?? null)).map((s) => publicView(s, user)));
}

const Create = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  domain: z.string().trim().min(3, "Enter your site's domain, e.g. example.com").max(253),
  timezone: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return Response.json({ error: "Sign in to add a site" }, { status: 401 });
    const body = Create.parse(await request.json());
    return Response.json(publicView(await createSite({ ...body, ownerId: user.id }), user), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
