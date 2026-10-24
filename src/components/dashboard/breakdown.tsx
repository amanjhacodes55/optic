"use client";

import { useState } from "react";
import { countryName, flag } from "@/lib/geo";
import { num, pct } from "@/lib/format";
import { BarList } from "../charts";
import { Card, ErrorNote, Loading, Tabs } from "../ui";
import { useApi, useDashboard } from "./state";

export type BreakdownRow = { value: string; visitors?: number; sessions?: number; pageviews?: number; events?: number; conversion_rate?: number; bounce_rate?: number };

export function dimLabel(dim: string, value: string) {
  if (value === "(none)" || value == null) return dim === "referrer" ? "(direct / none)" : "(not set)";
  if (dim === "country") return `${flag(value)}  ${countryName(value)}`;
  return value;
}

/** A card with tabs, each tab a dimension breakdown; clicking a row filters the whole dashboard. */
export function BreakdownCard({ title, tabs, metric = "visitors", limit = 8 }: { title: string; tabs: { dim: string; label: string }[]; metric?: "visitors" | "pageviews" | "events" | "sessions"; limit?: number }) {
  const { qs, addFilter } = useDashboard();
  const [dim, setDim] = useState(tabs[0].dim);
  const { data, error, loading } = useApi<BreakdownRow[]>(`/api/stats/breakdown?${qs({ dim, limit })}`);
  const m = dim === "page" ? "pageviews" : dim === "event" ? "events" : metric;
  const total = (data ?? []).reduce((a, r) => a + (Number(r[m]) || 0), 0);
  return (
    <Card
      title={title}
      actions={tabs.length > 1 ? <Tabs value={dim} onChange={setDim} options={tabs.map((t) => ({ value: t.dim, label: t.label }))} /> : undefined}
    >
      <div className="mb-2 flex justify-between px-2 text-[11px] font-medium uppercase tracking-wider text-muted">
        <span>{tabs.find((t) => t.dim === dim)?.label}</span>
        <span>{m}</span>
      </div>
      {error ? (
        <ErrorNote message={error} />
      ) : loading && !data ? (
        <Loading height={250} />
      ) : (
        <BarList
          rows={(data ?? []).map((r) => ({ label: r.value, value: Number(r[m]) || 0, secondary: total ? pct((Number(r[m]) || 0) / total, 0) : undefined }))}
          format={num}
          onSelect={(v) => addFilter(dim, v)}
          renderLabel={(v) => dimLabel(dim, v)}
        />
      )}
    </Card>
  );
}
