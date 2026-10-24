import { currentUser, signupAllowed } from "@/lib/auth";

// Who is signed in (or null), and whether new accounts can be created.
export async function GET(request: Request) {
  return Response.json({ user: currentUser(request), signupAllowed: signupAllowed() }, { headers: { "Cache-Control": "no-store" } });
}
