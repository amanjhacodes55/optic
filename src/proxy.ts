import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, demoMode, verifyToken } from "@/lib/auth";

// Gate the dashboard and the management API. Public endpoints (collect, replay, config, ingest,
// auth) are excluded by the matcher; ingest checks its own API key.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await verifyToken(request.cookies.get(COOKIE)?.value);
  if (authed) return NextResponse.next();

  if (demoMode() && (request.method === "GET" || request.method === "HEAD")) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: demoMode() ? "read-only demo" : "unauthorized" }, { status: demoMode() ? 403 : 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/stats/:path*", "/api/sites/:path*"],
};
