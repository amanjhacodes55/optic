import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/auth-cookie";

// An optimistic check only: pages that always need an account redirect to sign-in when there is
// no session cookie. Every API route checks the session and site ownership itself, and site
// dashboards handle access client-side so public sites (the demo) open without an account.
export function proxy(request: NextRequest) {
  if (request.cookies.get(COOKIE)?.value) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/dashboard", "/account"],
};
