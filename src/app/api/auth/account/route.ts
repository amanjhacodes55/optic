import { z } from "zod";
import { AuthError, changePassword, currentUser, updateUser } from "@/lib/auth";
import { authError } from "@/lib/http";

const Patch = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Use at least 8 characters").max(200).optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = currentUser(request);
    if (!user) throw new AuthError("Sign in first", 401);
    const body = Patch.parse(await request.json());
    if (body.name) updateUser(user.id, { name: body.name });
    if (body.newPassword) await changePassword(user.id, body.currentPassword ?? "", body.newPassword);
    return Response.json({ user: currentUser(request) });
  } catch (err) {
    return authError(err);
  }
}
