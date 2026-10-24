"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/dashboard/shell";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (r.ok) router.replace(next.startsWith("/") ? next : "/dashboard");
    else setError((await r.json().catch(() => ({}))).error ?? "Sign-in failed");
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-6">
      <Link href="/" className="mb-6 flex items-center gap-2 font-semibold">
        <Logo /> Optic
      </Link>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mb-5 mt-1 text-sm text-ink-2">Use the password set in OPTIC_PASSWORD.</p>
      <label className="label" htmlFor="pw">
        Password
      </label>
      <input id="pw" type="password" autoFocus className="input mt-1 w-full" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="mt-2 text-sm" style={{ color: "var(--critical)" }}>⚠ {error}</p>}
      <button className="btn btn-primary mt-4 w-full justify-center" disabled={busy || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
