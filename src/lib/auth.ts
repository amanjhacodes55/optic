// Single-owner auth: one password from the environment, a signed, expiring cookie.
// Uses Web Crypto so the same code runs in the proxy and in route handlers.

export const COOKIE = "optic_session";
const MAX_AGE_S = 30 * 86_400;

export function configuredPassword(): string {
  return process.env.OPTIC_PASSWORD || "optic";
}

export function usingDefaultPassword(): boolean {
  return !process.env.OPTIC_PASSWORD;
}

/** Read-only public demo: anyone can view dashboards, nobody can change anything. */
export function demoMode(): boolean {
  return process.env.OPTIC_DEMO_MODE === "1" || process.env.OPTIC_DEMO_MODE === "true";
}

function secret(): string {
  return process.env.OPTIC_SECRET || "optic-secret:" + configuredPassword();
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(now = Date.now()): Promise<{ value: string; maxAge: number }> {
  const exp = Math.floor(now / 1000) + MAX_AGE_S;
  return { value: `${exp}.${await hmac(String(exp))}`, maxAge: MAX_AGE_S };
}

export async function verifyToken(token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, await hmac(exp));
}

export async function checkPassword(input: string): Promise<boolean> {
  // Compare HMACs so the comparison time does not depend on the password.
  return safeEqual(await hmac("pw:" + input), await hmac("pw:" + configuredPassword()));
}
