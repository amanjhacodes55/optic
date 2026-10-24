"use client";

import { useState } from "react";
import { duration, money, num, pct } from "@/lib/format";
import { BarList } from "../charts";
import { Card, DataTable, ErrorNote, Loading, Tabs, type Column } from "../ui";
import { dimLabel } from "./breakdown";
import { useApi, useDashboard } from "./state";

type Row = Record<string, unknown> & { value: string };

/** Full metric table for one session dimension at a time, with a ranked bar list beside it. */
export function DimensionReport({ title, dims }: { title: string; dims: { dim: string; label: string }[] }) {
  const { qs, addFilter, site } = useDashboard();
  const [dim, setDim] = useState(dims[0].dim);
  const { data, error, loading } = useApi<Row[]>(`/api/stats/breakdown?${qs({ dim, limit: 200 })}`);
  const label = dims.find((d) => d.dim === dim)?.label ?? dim;
  const columns: Column<Row>[] = [
    { key: "value", label, render: (r) => dimLabel(dim, r.value), value: (r) => r.value },
    { key: "visitors", label: "Visitors", format: num },
    { key: "sessions", label: "Sessions", format: num },
    { key: "views_per_session", label: "Views / session", format: (n) => n.toFixed(2) },
    { key: "bounce_rate", label: "Bounce rate", format: (n) => pct(n) },
    { key: "avg_duration", label: "Avg. duration", format: duration },
    { key: "conversion_rate", label: "Conv. rate", format: (n) => pct(n, 2) },
    { key: "revenue", label: "Revenue", format: (n) => money(n, site?.settings.currency) },
  ];
  return (
    <Card title={title} actions={dims.length > 1 ? <Tabs value={dim} onChange={setDim} options={dims.map((d) => ({ value: d.dim, label: d.label }))} /> : undefined} pad={false}>
      {error ? (
        <div className="p-4">
          <ErrorNote message={error} />
        </div>
      ) : loading && !data ? (
        <Loading height={300} />
      ) : (
        <div className="grid gap-0 xl:grid-cols-[minmax(0,320px)_1fr]">
          <div className="border-b border-line p-4 xl:border-b-0 xl:border-r">
            <BarList rows={(data ?? []).slice(0, 10).map((r) => ({ label: r.value, value: Number(r.sessions) }))} format={num} onSelect={(v) => addFilter(dim, v)} renderLabel={(v) => dimLabel(dim, v)} />
            <p className="mt-2 px-2 text-xs text-muted">Sessions. Click a row to filter every report.</p>
          </div>
          <div className="min-w-0 py-2">
            <DataTable rows={data ?? []} columns={columns} initialSort="visitors" onRowClick={(r) => addFilter(dim, r.value)} exportName={`optic-${dim}`} />
          </div>
        </div>
      )}
    </Card>
  );
}
