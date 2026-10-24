"use client";

import { useState } from "react";
import { ColumnChart, LineChart } from "@/components/charts";
import { dimLabel } from "@/components/dashboard/breakdown";
import { DIM_LABELS } from "@/components/dashboard/shell";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, DataTable, ErrorNote, Loading, PageHeader, type Column } from "@/components/ui";
import { duration, money, num, pct } from "@/lib/format";

const DIMS: Record<string, string> = {
  ...DIM_LABELS,
  date: "Date",
  week: "Week",
  hour_of_day: "Hour of day",
  day_of_week: "Day of week",
  visitor_type: "New / returning",
};
delete DIMS.page;
delete DIMS.event;

const METRICS: Record<string, { label: string; fmt: (n: number, cur?: string) => string }> = {
  visitors: { label: "Visitors", fmt: (n) => num(n) },
  sessions: { label: "Sessions", fmt: (n) => num(n) },
  pageviews: { label: "Pageviews", fmt: (n) => num(n) },
  views_per_session: { label: "Views / session", fmt: (n) => n.toFixed(2) },
  bounce_rate: { label: "Bounce rate", fmt: (n) => pct(n) },
  engagement_rate: { label: "Engagement rate", fmt: (n) => pct(n) },
  avg_duration: { label: "Avg. duration", fmt: (n) => duration(n) },
  conversions: { label: "Conversions", fmt: (n) => num(n) },
  conversion_rate: { label: "Conversion rate", fmt: (n) => pct(n, 2) },
  revenue: { label: "Revenue", fmt: (n, c) => money(n, c) },
  revenue_per_session: { label: "Revenue / session", fmt: (n, c) => money(n, c, false) },
};

type Result = { dims: string[]; metrics: string[]; rows: Record<string, string | number>[] };

export default function ExplorePage() {
  const { qs, site } = useDashboard();
  const [dims, setDims] = useState<string[]>(["channel", "device"]);
  const [metrics, setMetrics] = useState<string[]>(["sessions", "conversion_rate", "revenue"]);
  const { data, error, loading } = useApi<Result>(dims.length && metrics.length ? `/api/stats/explore?${qs({ dim: dims, metric: metrics, limit: 500 })}` : null);
  const cur = site?.settings.currency;

  const columns: Column<Record<string, string | number>>[] = [
    ...dims.map((d) => ({ key: d, label: DIMS[d], render: (r: Record<string, string | number>) => dimLabel(d, String(r[d])), value: (r: Record<string, string | number>) => r[d], align: "left" as const })),
    ...metrics.map((m) => ({ key: m, label: METRICS[m].label, format: (n: number) => METRICS[m].fmt(n, cur) })),
  ];
  const timeDim = dims.length === 1 && dims[0] === "date";
  const singleDim = dims.length === 1 && !timeDim;
  const first = metrics[0];

  return (
    <>
      <PageHeader title="Explore" description="Build a custom report: pick up to three dimensions and eight metrics. Global filters and the date range apply. Export to CSV for notebooks or spreadsheets." />
      <Card className="mb-4">
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset>
            <legend className="label mb-2">Dimensions ({dims.length}/3, in grouping order)</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(DIMS).map(([k, label]) => {
                const on = dims.includes(k);
                return (
                  <button
                    key={k}
                    className={`h-7 rounded-full border px-3 text-xs font-medium ${on ? "border-accent bg-accent-wash text-accent-ink" : "border-line text-ink-2 hover:text-ink"}`}
                    onClick={() => setDims((d) => (on ? d.filter((x) => x !== k) : d.length < 3 ? [...d, k] : d))}
                  >
                    {on && <span className="mr-1 tabular">{dims.indexOf(k) + 1}</span>}
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label mb-2">Metrics ({metrics.length}/8)</legend>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(METRICS).map(([k, m]) => {
                const on = metrics.includes(k);
                return (
                  <button
                    key={k}
                    className={`h-7 rounded-full border px-3 text-xs font-medium ${on ? "border-accent bg-accent-wash text-accent-ink" : "border-line text-ink-2 hover:text-ink"}`}
                    onClick={() => setMetrics((x) => (on ? x.filter((y) => y !== k) : x.length < 8 ? [...x, k] : x))}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </Card>
      {error && <ErrorNote message={error} />}
      {data && first && (timeDim || singleDim) && (
        <Card title={`${METRICS[first].label} by ${DIMS[dims[0]]}`} className="mb-4">
          {timeDim ? (
            <LineChart height={220} labels={data.rows.map((r) => String(r.date))} format={(n) => METRICS[first].fmt(n, cur)} series={[{ key: first, label: METRICS[first].label, values: data.rows.map((r) => Number(r[first])), color: "var(--s1)", kind: "area" }]} />
          ) : (
            <ColumnChart
              height={220}
              labels={data.rows.slice(0, 24).map((r) => String(dimLabel(dims[0], String(r[dims[0]]))).slice(0, 14))}
              values={data.rows.slice(0, 24).map((r) => Number(r[first]))}
              format={(n) => METRICS[first].fmt(n, cur)}
            />
          )}
        </Card>
      )}
      <Card pad={false} title="Results" subtitle={data ? `${data.rows.length} rows` : undefined}>
        <div className="py-2">{loading && !data ? <Loading /> : data ? <DataTable rows={data.rows} columns={columns} exportName="optic-explore" maxRows={50} /> : null}</div>
      </Card>
    </>
  );
}
