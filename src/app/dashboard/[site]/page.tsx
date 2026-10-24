"use client";

import { useState } from "react";
import { BreakdownCard } from "@/components/dashboard/breakdown";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { LineChart } from "@/components/charts";
import { Card, ErrorNote, Legend, Loading, PageHeader, StatTile } from "@/components/ui";
import { delta, duration, money, num, pct } from "@/lib/format";

type Point = { label: string; visitors: number; sessions: number; pageviews: number; bounce_rate: number; avg_duration: number; conversions: number; revenue: number };
type Kpis = Point & { conversion_rate: number; views_per_session: number; new_visitors: number };
type Overview = { bucket: string; current: Kpis; previous: Kpis; series: Point[]; previousSeries: Point[] };

const METRICS = [
  { key: "visitors", label: "Visitors", fmt: num, up: true },
  { key: "sessions", label: "Sessions", fmt: num, up: true },
  { key: "pageviews", label: "Pageviews", fmt: num, up: true },
  { key: "bounce_rate", label: "Bounce rate", fmt: (n: number) => pct(n), up: false },
  { key: "avg_duration", label: "Session duration", fmt: duration, up: true },
  { key: "conversions", label: "Conversions", fmt: num, up: true },
  { key: "revenue", label: "Revenue", fmt: (n: number) => money(n), up: true },
] as const;

export default function OverviewPage() {
  const { qs, compare, site } = useDashboard();
  const { data, error, loading } = useApi<Overview>(`/api/stats/overview?${qs()}`);
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("visitors");
  const m = METRICS.find((x) => x.key === metric)!;
  const fmt = metric === "revenue" ? (n: number) => money(n, site?.settings.currency) : m.fmt;

  return (
    <>
      <PageHeader title="Overview" description="How many people visited, where they came from and what they did." />
      {error && <ErrorNote message={error} />}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {METRICS.map((k) => (
          <StatTile
            key={k.key}
            label={k.label}
            value={data ? (k.key === "revenue" ? money(data.current.revenue, site?.settings.currency) : k.fmt(data.current[k.key])) : "…"}
            delta={data ? delta(data.current[k.key], data.previous[k.key]) : undefined}
            goodWhenUp={k.up}
            trend={data?.series.map((p) => p[k.key])}
            active={metric === k.key}
            onClick={() => setMetric(k.key)}
          />
        ))}
      </div>
      <Card
        title={`${m.label} over time`}
        subtitle={data ? `By ${data.bucket}` : undefined}
        actions={compare ? <Legend items={[{ label: "This period", color: "var(--s1)" }, { label: "Previous period", color: "var(--compare)" }]} /> : undefined}
        className="mb-4"
      >
        {loading && !data ? (
          <Loading height={260} />
        ) : data ? (
          <LineChart
            height={260}
            labels={data.series.map((p) => p.label)}
            compareLabels={data.previousSeries.map((p) => p.label)}
            format={fmt}
            series={[
              ...(compare ? [{ key: "prev", label: "Previous", values: data.previousSeries.map((p) => p[metric]), color: "var(--compare)", kind: "compare" as const }] : []),
              { key: metric, label: m.label, values: data.series.map((p) => p[metric]), color: "var(--s1)", kind: "area" as const },
            ]}
          />
        ) : null}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownCard title="Traffic sources" tabs={[{ dim: "channel", label: "Channels" }, { dim: "referrer", label: "Referrers" }, { dim: "utm_campaign", label: "Campaigns" }]} />
        <BreakdownCard title="Pages" tabs={[{ dim: "page", label: "Top pages" }, { dim: "entry_page", label: "Entry" }, { dim: "exit_page", label: "Exit" }]} />
        <BreakdownCard title="Locations" tabs={[{ dim: "country", label: "Countries" }, { dim: "language", label: "Languages" }]} />
        <BreakdownCard title="Technology" tabs={[{ dim: "device", label: "Devices" }, { dim: "browser", label: "Browsers" }, { dim: "os", label: "OS" }]} />
      </div>
    </>
  );
}
