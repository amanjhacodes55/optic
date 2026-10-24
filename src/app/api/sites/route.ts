import { connection } from "next/server";
import { z } from "zod";
import { handleError } from "@/lib/http";
import { createSite, listSites } from "@/lib/sites";

export async function GET() {
  await connection(); // the database is read synchronously, so opt out of build-time prerendering explicitly
  return Response.json(listSites());
}

const Create = z.object({
  name: z.string().min(1).max(80),
  domain: z.string().min(3).max(253),
  timezone: z.string().max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const body = Create.parse(await request.json());
    return Response.json(createSite(body), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
