"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Site } from "@/lib/sites";

/** A site as the API returns it: the API key is only present for the owner. */
export type ClientSite = Omit<Site, "api_key"> & { api_key: string | null; can_edit: boolean };

// Dashboard state lives in the URL (?from=&to=&f=dim:value&compare=1), so every view can be
// bookmarked and shared, and the back button undoes a filter.

export type Filter = { dim: string; value: string };

type DashboardState = {
  siteId: string;
  site: ClientSite | null;
  from: string | null;
  to: string | null;
  preset: string;
  filters: Filter[];
  compare: boolean;
  /** Query string for API calls: site, range, filters + extras. */
  qs: (extra?: Record<string, string | number | undefined | (string | number)[]>) => string;
  setParams: (patch: Record<string, string | null>) => void;
  addFilter: (dim: string, value: string) => void;
  removeFilter: (f: Filter) => void;
  href: (path: string) => string;
};

const Ctx = createContext<DashboardState | null>(null);

export function DashboardProvider({ site, children }: { site: ClientSite | null; children: ReactNode }) {
  const params = useParams<{ site: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = useMemo<DashboardState>(() => {
    const filters = search.getAll("f").map((raw) => {
      const i = raw.indexOf(":");
      return { dim: raw.slice(0, i), value: raw.slice(i + 1) };
    });
    const keep = () => {
      const p = new URLSearchParams();
      for (const k of ["from", "to", "preset", "compare"]) {
        const v = search.get(k);
        if (v) p.set(k, v);
      }
      search.getAll("f").forEach((f) => p.append("f", f));
      return p;
    };
    const setParams = (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(search.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) p.delete(k);
        else p.set(k, v);
      }
      router.push(`${pathname}?${p.toString()}`, { scroll: false });
    };
    return {
      siteId: params.site,
      site,
      from: search.get("from"),
      to: search.get("to"),
      preset: search.get("preset") ?? "30d",
      filters,
      compare: search.get("compare") === "1",
      qs: (extra = {}) => {
        const p = new URLSearchParams();
        p.set("site", params.site);
        if (search.get("from")) p.set("from", search.get("from")!);
        if (search.get("to")) p.set("to", search.get("to")!);
        filters.forEach((f) => p.append("f", `${f.dim}:${f.value}`));
        for (const [k, v] of Object.entries(extra)) {
          if (v == null) continue;
          if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
          else p.set(k, String(v));
        }
        return p.toString();
      },
      setParams,
      addFilter: (dim, val) => {
        const p = new URLSearchParams(search.toString());
        const tag = `${dim}:${val}`;
        if (!p.getAll("f").includes(tag)) p.append("f", tag);
        router.push(`${pathname}?${p.toString()}`, { scroll: false });
      },
      removeFilter: (f) => {
        const p = new URLSearchParams(search.toString());
        const rest = p.getAll("f").filter((x) => x !== `${f.dim}:${f.value}`);
        p.delete("f");
        rest.forEach((x) => p.append("f", x));
        router.push(`${pathname}?${p.toString()}`, { scroll: false });
      },
      href: (path) => {
        const q = keep().toString();
        return `/dashboard/${params.site}${path}${q ? "?" + q : ""}`;
      },
    };
  }, [params.site, search, router, pathname, site]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDashboard must be used inside DashboardProvider");
  return v;
}

// ---- data fetching ------------------------------------------------------------------------------

const cache = new Map<string, { data: unknown; at: number }>();

export function useApi<T>(url: string | null, opts: { refreshMs?: number } = {}): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [tick, setTick] = useState(0);
  // The latest response, tagged with the URL it answers. Anything else is derived during render,
  // so changing the URL never needs a synchronous state reset.
  const [result, setResult] = useState<{ url: string; data: T | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`);
        return body as T;
      })
      .then((data) => {
        cache.set(url, { data, at: Date.now() });
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
        setResult({ url, data, error: null });
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setResult((prev) => ({ url, data: prev?.url === url ? prev.data : null, error: e.message }));
      });
    return () => ctrl.abort();
  }, [url, tick]);

  useEffect(() => {
    if (!opts.refreshMs || !url) return;
    const id = setInterval(() => setTick((t) => t + 1), opts.refreshMs);
    return () => clearInterval(id);
  }, [opts.refreshMs, url]);

  const reload = useCallback(() => {
    if (url) cache.delete(url);
    setTick((t) => t + 1);
  }, [url]);

  const fresh = !!url && result?.url === url;
  const cached = url ? ((cache.get(url)?.data as T | undefined) ?? null) : null;
  return {
    data: fresh ? result.data : cached,
    error: fresh ? result.error : null,
    loading: !!url && !fresh && cached == null,
    reload,
  };
}

export async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new Error(b.error ?? `Request failed (${r.status})`);
  }
  for (const k of [...cache.keys()]) cache.delete(k); // writes can change any report
  return r.status === 204 ? null : r.json();
}
