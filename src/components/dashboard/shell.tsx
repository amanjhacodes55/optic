"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Calendar, ChevronDown, Compass, DollarSign, FileText, Filter, Flame, Gauge, GitBranch, Grid3x3, LayoutGrid,
  Menu, Monitor, Moon, PlayCircle, Radio, Settings, Sparkles, Sun, Target, Users, X, Zap, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Site } from "@/lib/sites";
import { DashboardProvider, useApi, useDashboard } from "./state";

export const DIM_LABELS: Record<string, string> = {
  channel: "Channel",
  referrer: "Referrer",
  utm_source: "UTM source",
  utm_medium: "UTM medium",
  utm_campaign: "Campaign",
  utm_term: "UTM term",
  utm_content: "UTM content",
  country: "Country",
  device: "Device",
  browser: "Browser",
  os: "OS",
  language: "Language",
  platform: "Platform",
  entry_page: "Entry page",
  exit_page: "Exit page",
  screen: "Screen",
  page: "Page",
  event: "Event",
};

const NAV: { group: string; items: { path: string; label: string; icon: LucideIcon }[] }[] = [
  { group: "Reports", items: [{ path: "", label: "Overview", icon: Gauge }, { path: "/realtime", label: "Realtime", icon: Radio }] },
  { group: "Acquisition", items: [{ path: "/acquisition", label: "Traffic sources", icon: Compass }, { path: "/audience", label: "Audience", icon: Users }] },
  {
    group: "Behavior",
    items: [
      { path: "/pages", label: "Pages", icon: FileText },
      { path: "/events", label: "Events", icon: Zap },
      { path: "/funnels", label: "Funnels", icon: Filter },
      { path: "/paths", label: "Paths", icon: GitBranch },
      { path: "/retention", label: "Retention", icon: Grid3x3 },
    ],
  },
  { group: "Monetization", items: [{ path: "/ecommerce", label: "E-commerce", icon: DollarSign }, { path: "/goals", label: "Goals", icon: Target }] },
  {
    group: "Experience",
    items: [
      { path: "/heatmaps", label: "Heatmaps", icon: Flame },
      { path: "/recordings", label: "Recordings", icon: PlayCircle },
      { path: "/insights", label: "Insights", icon: Sparkles },
    ],
  },
  { group: "Analysis", items: [{ path: "/explore", label: "Explore", icon: LayoutGrid }, { path: "/settings", label: "Settings", icon: Settings }] },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { site: siteId } = useParams<{ site: string }>();
  const { data: site, error } = useApi<Site>(`/api/sites/${siteId}`);
  if (error) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="font-medium">Site not found</p>
        <Link className="text-accent-ink hover:underline" href="/dashboard">
          Back to your sites
        </Link>
      </div>
    );
  }
  return (
    <DashboardProvider site={site}>
      <Frame>{children}</Frame>
    </DashboardProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  // The mobile menu remembers the page it was opened on, so navigating closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  return (
    <div className="flex min-h-screen w-full">
      <aside className={`fixed inset-y-0 left-0 z-30 w-60 shrink-0 border-r border-line bg-surface transition-transform lg:static lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-full lg:sticky lg:top-0 lg:h-screen">
          <Sidebar />
        </div>
      </aside>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

function Sidebar() {
  const { site, href, siteId } = useDashboard();
  const pathname = usePathname();
  const base = `/dashboard/${siteId}`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <Logo />
        <Link href="/" className="font-semibold tracking-tight">
          Optic
        </Link>
      </div>
      <SiteSwitcher current={site} />
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => (
          <div key={g.group} className="mt-3">
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</div>
            {g.items.map((i) => {
              const active = i.path === "" ? pathname === base : pathname.startsWith(base + i.path);
              return (
                <Link
                  key={i.path}
                  href={href(i.path)}
                  className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-sm ${active ? "bg-accent-wash font-medium text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
                >
                  <i.icon aria-hidden size={16} strokeWidth={1.75} />
                  {i.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-3 text-xs text-muted">
        <a href="https://github.com/amanjhacodes55/optic" target="_blank" rel="noreferrer" className="hover:text-ink">
          Optic · MIT licensed
        </a>
      </div>
    </div>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--plane)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="3.2" fill="#3987e5" />
    </svg>
  );
}

function SiteSwitcher({ current }: { current: Site | null }) {
  const { data: sites } = useApi<Site[]>("/api/sites");
  const router = useRouter();
  return (
    <div className="px-3 pt-3">
      <select
        aria-label="Site"
        className="input w-full font-medium"
        value={current?.id ?? ""}
        onChange={(e) => (e.target.value === "__new" ? router.push("/dashboard?new=1") : router.push(`/dashboard/${e.target.value}`))}
      >
        {!current && <option value="">Loading…</option>}
        {(sites ?? (current ? [current] : [])).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="__new">+ Add a site</option>
      </select>
    </div>
  );
}

// ---- top bar ------------------------------------------------------------------------------------

function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

const PRESETS: { key: string; label: string; range: (today: string) => [string, string] }[] = [
  { key: "today", label: "Today", range: (t) => [t, t] },
  { key: "yesterday", label: "Yesterday", range: (t) => [addDays(t, -1), addDays(t, -1)] },
  { key: "7d", label: "Last 7 days", range: (t) => [addDays(t, -6), t] },
  { key: "30d", label: "Last 30 days", range: (t) => [addDays(t, -29), t] },
  { key: "90d", label: "Last 90 days", range: (t) => [addDays(t, -89), t] },
  { key: "mtd", label: "Month to date", range: (t) => [t.slice(0, 8) + "01", t] },
  { key: "12m", label: "Last 12 months", range: (t) => [addDays(t, -364), t] },
];

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { site, filters, removeFilter, compare, setParams } = useDashboard();
  return (
    <div className="sticky top-0 z-10 border-b border-line bg-plane/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-[1400px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <button className="btn px-2.5 lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu size={16} />
        </button>
        <div className="mr-auto flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{site?.name ?? "…"}</span>
          {site && <span className="hidden text-xs text-muted sm:inline">{site.domain}</span>}
          {filters.map((f) => (
            <span key={f.dim + f.value} className="chip">
              {DIM_LABELS[f.dim] ?? f.dim}: {f.value}
              <button aria-label={`Remove filter ${f.dim}`} onClick={() => removeFilter(f)} className="opacity-70 hover:opacity-100">
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={compare} onChange={(e) => setParams({ compare: e.target.checked ? "1" : null })} />
          Compare
        </label>
        <DateRange />
        <ThemeToggle />
      </div>
    </div>
  );
}

function DateRange() {
  const { site, from, to, preset, setParams } = useDashboard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = todayIn(site?.timezone ?? "UTC");
  const active = PRESETS.find((p) => p.key === preset);
  const [f, t] = from && to ? [from, to] : (active ?? PRESETS[3]).range(today);
  const [cf, setCf] = useState(f);
  const [ct, setCt] = useState(t);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const label = preset === "custom" ? `${f} → ${t}` : (active?.label ?? "Last 30 days");
  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Calendar size={15} className="text-ink-2" /> {label} <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-xl">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className="flex h-8 w-full items-center justify-between rounded-md px-3 text-sm hover:bg-surface-2"
              onClick={() => {
                const [a, b] = p.range(today);
                setParams({ preset: p.key, from: a, to: b });
                setOpen(false);
              }}
            >
              {p.label}
              {preset === p.key && <b aria-hidden>✓</b>}
            </button>
          ))}
          <div className="mt-1 border-t border-line p-2">
            <div className="label mb-1">Custom range</div>
            <div className="flex items-center gap-1">
              <input type="date" className="input w-full px-1 text-xs" value={cf} max={ct} onChange={(e) => setCf(e.target.value)} />
              <input type="date" className="input w-full px-1 text-xs" value={ct} min={cf} max={today} onChange={(e) => setCt(e.target.value)} />
            </div>
            <button
              className="btn btn-primary mt-2 w-full justify-center"
              onClick={() => {
                setParams({ preset: "custom", from: cf, to: ct });
                setOpen(false);
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme ?? null, () => null);
  const next = theme === "dark" ? "light" : theme === "light" ? null : "dark";
  return (
    <button
      className="btn px-2.5"
      aria-label="Toggle theme"
      title={`Theme: ${theme ?? "system"}`}
      onClick={() => {
        if (next) document.documentElement.dataset.theme = next;
        else delete document.documentElement.dataset.theme;
        try {
          if (next) localStorage.setItem("optic-theme", next);
          else localStorage.removeItem("optic-theme");
        } catch {}
      }}
    >
      {theme === "dark" ? <Moon size={16} /> : theme === "light" ? <Sun size={16} /> : <Monitor size={16} />}
    </button>
  );
}
