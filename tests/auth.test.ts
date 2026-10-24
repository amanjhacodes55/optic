import { beforeEach, describe, expect, it } from "vitest";
import { canEdit, editableSite, publicView, viewableSite } from "@/lib/access";
import { authenticate, createSession, createUser, destroySession, hashPassword, userFromToken, verifyPassword } from "@/lib/auth";
import { all, resetDbForTests } from "@/lib/db";
import { createSite, listSites } from "@/lib/sites";

beforeEach(async () => {
  await resetDbForTests();
});

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("accounts and sessions", () => {
  it("signs up, signs in case-insensitively, and rejects bad passwords", async () => {
    const u = await createUser({ email: "Sam@Example.com", name: "Sam", password: "password123" });
    expect(u.email).toBe("sam@example.com");
    expect((await authenticate("SAM@example.com", "password123")).id).toBe(u.id);
    await expect(authenticate("sam@example.com", "nope")).rejects.toThrow(/wrong email or password/i);
    await expect(authenticate("nobody@example.com", "password123")).rejects.toThrow(/wrong email or password/i);
  });

  it("refuses a second account with the same email", async () => {
    await createUser({ email: "a@example.com", name: "A", password: "password123" });
    await expect(createUser({ email: "A@example.com", name: "A2", password: "password123" })).rejects.toThrow(/already exists/);
  });

  it("stores only a hash of the session token, and logout revokes it", async () => {
    const u = await createUser({ email: "a@example.com", name: "A", password: "password123" });
    const { token } = await createSession(u.id);
    expect((await userFromToken(token))?.id).toBe(u.id);
    const stored = await all<{ token_hash: string }>("SELECT token_hash FROM auth_sessions");
    expect(stored.map((r) => r.token_hash)).not.toContain(token);
    await destroySession(token);
    expect(await userFromToken(token)).toBeNull();
    expect(await userFromToken("forged")).toBeNull();
  });
});

describe("site access", () => {
  it("owners edit their sites, others cannot see them, everyone can view public sites", async () => {
    const alice = await createUser({ email: "alice@example.com", name: "Alice", password: "password123" });
    const bob = await createUser({ email: "bob@example.com", name: "Bob", password: "password123" });
    const mine = await createSite({ name: "Alice's", domain: "alice.example", ownerId: alice.id });
    await createSite({ id: "demo", name: "Demo", domain: "demo.example", public: true });

    expect(canEdit(mine, alice)).toBe(true);
    expect((await editableSite(mine.id, alice)).id).toBe(mine.id);
    await expect(viewableSite(mine.id, bob)).rejects.toThrow(/not found/i);
    await expect(viewableSite(mine.id, null)).rejects.toThrow(/sign in/i);

    expect((await viewableSite("demo", null)).id).toBe("demo");
    expect((await viewableSite("demo", bob)).id).toBe("demo");
    await expect(editableSite("demo", bob)).rejects.toThrow(/read-only/i);

    expect((await listSites(alice.id)).map((s) => s.id)).toEqual([mine.id, "demo"]);
    expect((await listSites(bob.id)).map((s) => s.id)).toEqual(["demo"]);
    expect((await listSites(null)).map((s) => s.id)).toEqual(["demo"]);
  });

  it("never sends the API key to someone who is not the owner", async () => {
    const alice = await createUser({ email: "alice@example.com", name: "Alice", password: "password123" });
    const site = await createSite({ name: "S", domain: "s.example", ownerId: alice.id, public: true });
    expect(publicView(site, alice).api_key).toMatch(/^opk_/);
    expect(publicView(site, null)).toMatchObject({ api_key: null, can_edit: false });
  });
});
