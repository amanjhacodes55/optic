import { checkPassword, COOKIE, issueToken } from "@/lib/auth";
import { clientIp } from "@/lib/geo";
import { rateLimited } from "@/lib/http";

// POST {password} signs in; DELETE signs out.
export async function POST(request: Request) {
  if (rateLimited("login:" + clientIp(request.headers), 10)) return Response.json({ error: "too many attempts, wait a minute" }, { status: 429 });
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (!password || !(await checkPassword(password))) return Response.json({ error: "wrong password" }, { status: 401 });
  const token = await issueToken();
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${COOKIE}=${token.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token.maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return res;
}

export async function DELETE() {
  const res = new Response(null, { status: 204 });
  res.headers.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
