import { z } from "zod";
import { AuthError, createSession, createUser, sessionCookie, signupAllowed } from "@/lib/auth";
import { clientIp } from "@/lib/geo";
import { authError, rateLimited } from "@/lib/http";

const Signup = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export async function POST(request: Request) {
  try {
    if (rateLimited("signup:" + clientIp(request.headers), 10, 600_000)) throw new AuthError("Too many sign-ups from this address. Try again later.", 429);
    if (!(await signupAllowed())) throw new AuthError("Sign-ups are closed on this Optic instance. Ask its owner for an account.", 403);
    const body = Signup.parse(await request.json());
    const user = await createUser(body);
    const { token, maxAge } = await createSession(user.id);
    const res = Response.json({ user }, { status: 201 });
    res.headers.append("Set-Cookie", sessionCookie(request, token, maxAge));
    return res;
  } catch (err) {
    return authError(err);
  }
}
