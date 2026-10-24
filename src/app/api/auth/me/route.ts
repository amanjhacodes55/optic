import { currentUser, signupAllowed } from "@/lib/auth";

// Who is signed in (or null), and whether new accounts can be created.
export async function GET(request: Request) {
  const [user, open] = await Promise.all([currentUser(request), signupAllowed()]);
  return Response.json({ user, signupAllowed: open }, { headers: { "Cache-Control": "no-store" } });
}
