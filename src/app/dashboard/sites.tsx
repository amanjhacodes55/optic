"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo, ThemeToggle } from "@/components/dashboard/shell";
import { send, useApi } from "@/components/dashboard/state";
import { ErrorNote, Loading } from "@/components/ui";
import type { Site } from "@/lib/sites";

export function SitesList() {
  const { data: sites, error, loading } = useApi<Site[]>("/api/sites");
  const [adding, setAdding] = useState(useSearchParams().get("new") === "1");
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo /> Optic
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            className="btn"
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              router.push("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          + Add a site
        </button>
      </div>
      {error && <ErrorNote message={error} />}
      {adding && <AddSite onDone={(id) => router.push(`/dashboard/${id}/settings?welcome=1`)} onCancel={() => setAdding(false)} />}
      {loading && !sites ? (
        <Loading />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(sites ?? []).map((s) => (
            <Link key={s.id} href={`/dashboard/${s.id}`} className="card block p-5 transition-colors hover:bg-surface-2">
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-ink-2">{s.domain}</div>
              <div className="mt-3 text-xs text-muted">
                Site ID <code>{s.id}</code> · {s.timezone}
              </div>
            </Link>
          ))}
          {sites?.length === 0 && !adding && (
            <div className="card p-6 text-sm text-ink-2 sm:col-span-2">
              No sites yet. Add one to get a tracking snippet, or run <code>npm run seed</code> to load the demo shop.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddSite({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timezone];
  return (
    <form
      className="card mb-4 grid gap-3 p-5 sm:grid-cols-[1fr_1fr_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const site = (await send("/api/sites", "POST", { name, domain, timezone })) as Site;
          onDone(site.id);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="label">Name</span>
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="My blog" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Domain</span>
        <input className="input" required value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Reporting time zone</span>
        <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button className="btn btn-primary">Create</button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="text-sm sm:col-span-4" style={{ color: "var(--critical)" }}>⚠ {error}</p>}
    </form>
  );
}
