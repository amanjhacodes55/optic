"use client";

import { ArrowRight, Globe, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo, ThemeToggle } from "@/components/dashboard/shell";
import { send, useApi, type ClientSite } from "@/components/dashboard/state";
import { ErrorNote, Loading } from "@/components/ui";
import { UserMenu, useSession } from "@/components/user-menu";

export function SitesList() {
  const { data: sites, error, loading } = useApi<ClientSite[]>("/api/sites");
  const { user } = useSession();
  const [adding, setAdding] = useState(useSearchParams().get("new") === "1");
  const router = useRouter();
  const own = (sites ?? []).filter((s) => s.can_edit);
  const shared = (sites ?? []).filter((s) => !s.can_edit);
  const firstRun = sites !== null && own.length === 0;

  return (
    <div className="w-full">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo /> Optic
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {error && <ErrorNote message={error} />}
        {loading && !sites ? (
          <Loading height={300} />
        ) : firstRun ? (
          <div className="mx-auto max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight">{user ? `Welcome, ${user.name.split(" ")[0]}` : "Welcome"}</h1>
            <p className="mt-1 text-ink-2">Add the website you want to measure. You will get a one-line snippet to paste into it.</p>
            <div className="card mt-6 p-5">
              <Steps />
              <AddSite onDone={(id) => router.push(`/dashboard/${id}/settings?welcome=1`)} />
            </div>
            {shared.length > 0 && (
              <p className="mt-6 text-center text-sm text-ink-2">
                Not ready yet?{" "}
                <Link className="font-medium text-accent-ink hover:underline" href={`/dashboard/${shared[0].id}`}>
                  Look around the demo first
                </Link>
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">Your sites</h1>
              <button className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
                <Plus size={15} /> Add a site
              </button>
            </div>
            {adding && (
              <div className="card mb-4 p-5">
                <AddSite onDone={(id) => router.push(`/dashboard/${id}/settings?welcome=1`)} onCancel={() => setAdding(false)} />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {own.map((s) => (
                <SiteCard key={s.id} site={s} />
              ))}
            </div>
            {shared.length > 0 && (
              <>
                <h2 className="mb-3 mt-10 text-sm font-semibold text-ink-2">Demo</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {shared.map((s) => (
                    <SiteCard key={s.id} site={s} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SiteCard({ site }: { site: ClientSite }) {
  return (
    <Link href={`/dashboard/${site.id}`} className="card group flex items-center justify-between p-5 transition-colors hover:bg-surface-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-semibold">
          <Globe size={16} className="shrink-0 text-muted" />
          <span className="truncate">{site.name}</span>
          {!site.can_edit && <span className="chip h-5 px-2 text-[11px]">Read-only</span>}
        </div>
        <div className="mt-0.5 truncate text-sm text-ink-2">{site.domain}</div>
        <div className="mt-3 text-xs text-muted">
          Site ID <code>{site.id}</code> · {site.timezone}
        </div>
      </div>
      <ArrowRight size={18} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Steps() {
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2 text-xs">
      {["Add your site", "Paste the snippet", "Watch visits arrive"].map((s, i) => (
        <li key={s} className={`rounded-lg px-3 py-2 ${i === 0 ? "bg-accent-wash font-medium text-accent-ink" : "bg-surface-2 text-ink-2"}`}>
          <span className="mr-1 tabular">{i + 1}.</span> {s}
        </li>
      ))}
    </ol>
  );
}

function AddSite({ onDone, onCancel }: { onDone: (id: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timezone];
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const site = (await send("/api/sites", "POST", { name, domain, timezone })) as ClientSite;
          onDone(site.id);
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="label">Site name</span>
        <input className="input h-10" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="My blog" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Domain</span>
        <input className="input h-10" required value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="label">Reporting time zone</span>
        <select className="input h-10" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <span className="text-xs text-muted">Days in reports start at midnight in this time zone.</span>
      </label>
      {error && (
        <div className="sm:col-span-2">
          <ErrorNote message={error} />
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-primary h-10" disabled={busy}>
          {busy ? "Adding…" : "Add site and get the snippet"}
        </button>
        {onCancel && (
          <button type="button" className="btn h-10" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
