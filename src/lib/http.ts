import { AccessError } from "./access";
import { AuthError } from "./auth";
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
  if (err instanceof QueryError || err instanceof IngestError || err instanceof AccessError) return Response.json({ error: err.message }, { status: err.status, headers });
  if (err && typeof err === "object" && "issues" in err) return Response.json({ error: "invalid payload", issues: (err as { issues: unknown }).issues }, { status: 400, headers });
  if (err instanceof SyntaxError) return Response.json({ error: "invalid JSON" }, { status: 400, headers });
  console.error(err);
  return Response.json({ error: "internal error" }, { status: 500, headers });
}

/** Errors for the sign-in, sign-up and account forms: one readable message, plus the field it belongs to. */
export function authError(err: unknown) {
  if (err instanceof AuthError) return Response.json({ error: err.message, field: err.field }, { status: err.status });
  if (err && typeof err === "object" && "issues" in err) {
    const issue = (err as { issues: { message: string; path: (string | number)[] }[] }).issues[0];
    return Response.json({ error: issue?.message ?? "Check the form and try again", field: issue?.path[0] }, { status: 400 });
  }
  return handleError(err);
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
