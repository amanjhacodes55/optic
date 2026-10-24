import { IngestError } from "./ingest";
import { QueryError } from "./query/context";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}

export function handleError(err: unknown, headers: HeadersInit = {}) {
  if (err instanceof QueryError || err instanceof IngestError) return Response.json({ error: err.message }, { status: err.status, headers });
  if (err && typeof err === "object" && "issues" in err) return Response.json({ error: "invalid payload", issues: (err as { issues: unknown }).issues }, { status: 400, headers });
  if (err instanceof SyntaxError) return Response.json({ error: "invalid JSON" }, { status: 400, headers });
  console.error(err);
  return Response.json({ error: "internal error" }, { status: 500, headers });
}

/** Fixed-window limiter, per key, kept in memory. Good enough for a single self-hosted node. */
const windows = new Map<string, { start: number; count: number }>();
export function rateLimited(key: string, limit = 600, windowMs = 60_000): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 50_000) windows.clear();
    return false;
  }
  w.count++;
  return w.count > limit;
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new IngestError("payload too large", 413);
  return JSON.parse(text);
}
