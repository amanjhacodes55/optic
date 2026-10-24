import crypto from "node:crypto";
import { promisify } from "node:util";
import { COOKIE } from "./auth-cookie";
import { batch, one, run } from "./db";
import { randomId } from "./visitor";

// Email + password accounts. Passwords are hashed with scrypt; sessions are random tokens kept in
// an HttpOnly cookie, and only their SHA-256 is stored, so a leaked database cannot log anyone in.

export { COOKIE };
export const SESSION_DAYS = 30;
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };

export type User = { id: string; email: string; name: string; created_at: number };

export async function signupAllowed(): Promise<boolean> {
  // Open by default so anyone can try a fresh install. Set OPTIC_ALLOW_SIGNUP=false to close it
  // after creating your account; the first account can always be created.
  if (process.env.OPTIC_ALLOW_SIGNUP !== "false") return true;
  return (await one<{ n: number }>("SELECT COUNT(*) AS n FROM users"))!.n === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length, SCRYPT);
  return crypto.timingSafeEqual(key, expected);
}

export class AuthError extends Error {
  constructor(message: string, public status = 400, public field?: string) {
    super(message);
  }
}

export async function createUser(input: { email: string; name: string; password: string }): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (await one("SELECT 1 FROM users WHERE email = ?", [email])) throw new AuthError("An account with this email already exists. Sign in instead.", 409, "email");
  const user: User = { id: randomId(9), email, name: input.name.trim(), created_at: Date.now() };
  await run("INSERT INTO users(id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", [
    user.id,
    user.email,
    user.name,
    await hashPassword(input.password),
    user.created_at,
  ]);
  return user;
}

// A real hash to compare against when the email is unknown, so response time does not reveal
// which emails have accounts.
let dummyHash: Promise<string> | null = null;

export async function authenticate(email: string, password: string): Promise<User> {
  const row = await one<User & { password_hash: string }>("SELECT id, email, name, created_at, password_hash FROM users WHERE email = ?", [
    email.trim().toLowerCase(),
  ]);
  dummyHash ??= hashPassword("not-a-real-password");
  const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
  if (!row || !ok) throw new AuthError("Wrong email or password.", 401);
  return { id: row.id, email: row.email, name: row.name, created_at: row.created_at };
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string): Promise<{ token: string; maxAge: number }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  await batch([
    { sql: "INSERT INTO auth_sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", args: [sha(token), userId, now, now + SESSION_DAYS * 86_400_000] },
    { sql: "DELETE FROM auth_sessions WHERE expires_at < ?", args: [now] },
  ]);
  return { token, maxAge: SESSION_DAYS * 86_400 };
}

export async function destroySession(token: string | undefined) {
  if (token) await run("DELETE FROM auth_sessions WHERE token_hash = ?", [sha(token)]);
}

export async function userFromToken(token: string | undefined | null): Promise<User | null> {
  if (!token) return null;
  return (
    (await one<User>(
      `SELECT u.id, u.email, u.name, u.created_at FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [sha(token), Date.now()],
    )) ?? null
  );
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function tokenFrom(request: Request): string | undefined {
  return readCookie(request.headers.get("cookie"), COOKIE);
}

export function currentUser(request: Request): Promise<User | null> {
  return userFromToken(tokenFrom(request));
}

/** Set-Cookie value. Secure only over HTTPS, so plain-HTTP self-hosting on a LAN still works. */
export function sessionCookie(request: Request, token: string, maxAge: number): string {
  const https = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}

export async function updateUser(id: string, patch: { name?: string }) {
  if (patch.name) await run("UPDATE users SET name = ? WHERE id = ?", [patch.name.trim(), id]);
}

export async function changePassword(id: string, current: string, next: string) {
  const row = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [id]);
  if (!row || !(await verifyPassword(current, row.password_hash))) throw new AuthError("Your current password is wrong.", 400, "current");
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(next), id]);
}
