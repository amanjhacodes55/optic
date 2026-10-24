import { z } from "zod";
import { authenticate, AuthError, createSession, sessionCookie } from "@/lib/auth";
import { clientIp } from "@/lib/geo";
import { authError, rateLimited } from "@/lib/http";

const Login = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function POST(request: Request) {
  try {
    if (rateLimited("login:" + clientIp(request.headers), 10)) throw new AuthError("Too many attempts. Wait a minute and try again.", 429);
    const body = Login.parse(await request.json());
    const user = await authenticate(body.email, body.password);
    const { token, maxAge } = createSession(user.id);
    const res = Response.json({ user });
    res.headers.append("Set-Cookie", sessionCookie(request, token, maxAge));
    return res;
  } catch (err) {
    return authError(err);
  }
}
