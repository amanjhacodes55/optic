import { COOKIE, destroySession, tokenFrom } from "@/lib/auth";

export async function POST(request: Request) {
  destroySession(tokenFrom(request));
  const res = new Response(null, { status: 204 });
  res.headers.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
