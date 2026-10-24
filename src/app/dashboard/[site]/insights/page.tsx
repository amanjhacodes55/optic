"use client";

import { CircleAlert, CircleCheck, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LineChart } from "@/components/charts";
import { dimLabel } from "@/components/dashboard/breakdown";
import { DIM_LABELS } from "@/components/dashboard/shell";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, Empty, Legend, Loading, PageHeader, Tabs } from "@/components/ui";
import { longDate, money, ms, num, pct, timeAgo } from "@/lib/format";

type Insights = {
  metric: string;
  history: { label: string; value: number }[];
  anomalies: { index: number; label: string; value: number; expected: number; score: number; direction: "spike" | "drop" }[];
  forecast: { label: string; value: number; low: number; high: number }[];
  forecastTotal: number;
  model: { kind: string; alpha: number; beta: number; gamma: number };
  changes: { dim: string; total: { current: number; previous: number }; rows: { value: string; current: number; previous: number; change: number; share: number }[] }[];
  frustration: {
    rage: { path: string; selector: string; rage: number; dead: number; sessions: number }[];
    errors: { message: string; path: string; count: number; sessions: number; last_seen: number }[];
  };
  vitals: { summary: { name: string; p75: number; samples: number; rating: string }[]; slowPages: { path: string; p75: number; samples: number; rating: string }[] };
};

const METRICS = [
  { value: "sessions", label: "Sessions" },
  { value: "visitors", label: "Visitors" },
  { value: "conversions", label: "Conversions" },
  { value: "revenue", label: "Revenue" },
] as const;

const VITAL_INFO: Record<string, string> = {
  LCP: "Largest Contentful Paint",
  INP: "Interaction to Next Paint",
  CLS: "Cumulative Layout Shift",
  FCP: "First Contentful Paint",
  TTFB: "Time to First Byte",
};

export default function InsightsPage() {
  const { qs, href, site } = useDashboard();
  const [metric, setMetric] = useState<(typeof METRICS)[number]["value"]>("sessions");
  const { data, loading } = useApi<Insights>(`/api/stats/insights?${qs({ metric })}`);
  const fmt = metric === "revenue" ? (n: number) => money(n, site?.settings.currency) : num;
  const label = METRICS.find((m) => m.value === metric)!.label;

  if (loading && !data) return <Loading height={500} />;
  if (!data) return null;

  const h = data.history.length;
  const labels = [...data.history.map((x) => x.label), ...data.forecast.map((f) => f.label)];
  const actual = [...data.history.map((x) => x.value), ...data.forecast.map(() => null)];
  const forecast = [...data.history.map((_, i) => (i === h - 1 ? data.history[i].value : null)), ...data.forecast.map((f) => f.value)];
  const low = [...data.history.map(() => null), ...data.forecast.map((f) => f.low)];
  const high = [...data.history.map(() => null), ...data.forecast.map((f) => f.high)];
  const offset = data.history.length ? labels.indexOf(data.history[0].label) : 0;
  const markers = data.anomalies
    .map((a) => ({ index: data.history.findIndex((x) => x.label === a.label) + offset, title: `${a.direction === "spike" ? "Spike" : "Drop"}: expected about ${fmt(Math.round(a.expected))}`, tone: "critical" as const }))
    .filter((m) => m.index >= 0);

  return (
    <>
      <PageHeader
        title="Insights"
        description="Automatic analysis: unusual days, a two-week forecast, what drove the change from the previous period, and where visitors got frustrated."
        actions={<Tabs value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} size="md" />}
      />
      <div className="space-y-4">
        <Card
          title={`${label}: history, anomalies and forecast`}
          subtitle={`Next 14 days: about ${fmt(Math.round(data.forecastTotal))} ${label.toLowerCase()} (${data.model.kind}, α=${data.model.alpha}, β=${data.model.beta}, γ=${data.model.gamma})`}
          actions={<Legend items={[{ label: "Actual", color: "var(--s1)" }, { label: "Forecast, 80% interval shaded", color: "var(--s2)" }, { label: "Anomaly", color: "var(--critical)" }]} />}
        >
          <LineChart
            height={280}
            labels={labels}
            format={fmt}
            band={{ low, high, color: "var(--s2)", label: "80% interval" }}
            markers={markers}
            series={[
              { key: "actual", label: "Actual", values: actual, color: "var(--s1)", kind: "area" },
              { key: "forecast", label: "Forecast", values: forecast, color: "var(--s2)", kind: "line" },
            ]}
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Anomalies" subtitle="Days far from the same weekday's recent median (robust z-score ≥ 3.5)">
            {data.anomalies.length === 0 ? (
              <Empty title="Nothing unusual in this period" />
            ) : (
              <ul className="space-y-3">
                {data.anomalies.map((a) => (
                  <li key={a.label} className="flex items-start gap-3">
                    {a.direction === "spike" ? <TrendingUp size={18} className="mt-0.5 shrink-0" style={{ color: "var(--good-ink)" }} /> : <TrendingDown size={18} className="mt-0.5 shrink-0" style={{ color: "var(--critical)" }} />}
                    <div className="text-sm">
                      <div className="font-medium">
                        {longDate(a.label)}: {a.direction === "spike" ? "spike" : "drop"} to {fmt(a.value)}
                      </div>
                      <div className="text-ink-2">
                        Expected about {fmt(Math.round(a.expected))} ({a.value > a.expected ? "+" : ""}
                        {pct((a.value - a.expected) / Math.max(1, a.expected), 0)}, z = {a.score.toFixed(1)}).{" "}
                        <Link className="text-accent-ink hover:underline" href={href("") .replace(/\?.*/, "") + `?preset=custom&from=${a.label}&to=${a.label}`}>
                          Open that day
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="What changed" subtitle={`Biggest contributors to the change in ${label.toLowerCase()} vs the previous period`}>
            <ChangeList data={data.changes} fmt={fmt} />
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Rage and dead clicks" subtitle="Elements people clicked repeatedly or that did nothing">
            {data.frustration.rage.length === 0 ? (
              <Empty title="No frustration signals" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-2">
                    <th className="pb-1 text-left font-medium">Element</th>
                    <th className="pb-1 text-right font-medium">Rage</th>
                    <th className="pb-1 text-right font-medium">Dead</th>
                    <th className="pb-1 text-right font-medium">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.frustration.rage.map((r) => (
                    <tr key={r.path + r.selector} className="border-t border-line">
                      <td className="py-1.5">
                        <code className="text-xs">{r.selector}</code>
                        <div className="text-xs text-muted">{r.path}</div>
                      </td>
                      <td className="py-1.5 text-right tabular" style={{ color: r.rage ? "var(--critical)" : undefined }}>
                        {num(r.rage)}
                      </td>
                      <td className="py-1.5 text-right tabular">{num(r.dead)}</td>
                      <td className="py-1.5 text-right tabular">{num(r.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Link href={href("/heatmaps")} className="mt-3 inline-block text-sm text-accent-ink hover:underline">
              See them on the heatmap →
            </Link>
          </Card>
          <Card title="JavaScript errors" subtitle="Grouped by message and page">
            {data.frustration.errors.length === 0 ? (
              <Empty title="No errors reported" />
            ) : (
              <ul className="space-y-2.5 text-sm">
                {data.frustration.errors.map((e) => (
                  <li key={e.message + e.path} className="flex items-start gap-2">
                    <CircleAlert size={15} className="mt-0.5 shrink-0" style={{ color: "var(--critical)" }} />
                    <div className="min-w-0 flex-1">
                      <code className="break-words text-xs">{e.message}</code>
                      <div className="text-xs text-muted">
                        {e.path} · {num(e.count)} times in {num(e.sessions)} sessions · last {timeAgo(e.last_seen)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link href={href("/recordings")} className="mt-3 inline-block text-sm text-accent-ink hover:underline">
              Watch sessions with errors →
            </Link>
          </Card>
        </div>

        <Card title="Core Web Vitals" subtitle="75th percentile of real-user measurements, rated with Google's thresholds">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {data.vitals.summary.map((v) => (
              <div key={v.name} className="rounded-xl border border-line p-3">
                <div className="text-xs text-ink-2" title={VITAL_INFO[v.name]}>
                  {v.name} <span className="text-muted">· {VITAL_INFO[v.name]}</span>
                </div>
                <div className="mt-1 text-xl font-semibold tabular">{v.name === "CLS" ? v.p75.toFixed(3) : ms(v.p75)}</div>
                <Rating rating={v.rating} />
                <div className="text-[11px] text-muted">{num(v.samples)} samples</div>
              </div>
            ))}
          </div>
          {data.vitals.slowPages.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-sm font-semibold">Slowest pages by LCP</h3>
              <ul className="space-y-1.5 text-sm">
                {data.vitals.slowPages.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3">
                    <span className="truncate">{p.path}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Rating rating={p.rating} compact />
                      <span className="w-16 text-right font-medium tabular">{ms(p.p75)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function Rating({ rating, compact }: { rating: string; compact?: boolean }) {
  const map = {
    good: { icon: CircleCheck, label: "Good", color: "var(--good-ink)" },
    "needs-improvement": { icon: TriangleAlert, label: "Needs improvement", color: "var(--serious)" },
    poor: { icon: CircleAlert, label: "Poor", color: "var(--critical)" },
  } as const;
  const r = map[rating as keyof typeof map] ?? map.good;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: r.color }}>
      <r.icon size={13} /> {compact ? null : r.label}
      {compact && <span className="sr-only">{r.label}</span>}
    </span>
  );
}

function ChangeList({ data, fmt }: { data: Insights["changes"]; fmt: (n: number) => string }) {
  const [dim, setDim] = useState(data[0]?.dim ?? "channel");
  const block = data.find((d) => d.dim === dim) ?? data[0];
  if (!block) return null;
  const max = Math.max(1, ...block.rows.map((r) => Math.abs(r.change)));
  const totalChange = block.total.current - block.total.previous;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs value={dim} onChange={setDim} options={data.map((d) => ({ value: d.dim, label: DIM_LABELS[d.dim] ?? d.dim }))} />
        <span className="text-xs text-ink-2">
          Total {fmt(block.total.previous)} → {fmt(block.total.current)} ({totalChange >= 0 ? "+" : ""}
          {fmt(totalChange)})
        </span>
      </div>
      <ul className="space-y-1.5">
        {block.rows.map((r) => (
          <li key={r.value} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_4.5rem] items-center gap-2 text-sm">
            <span className="truncate">{dimLabel(dim, r.value)}</span>
            <div className="relative h-4">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                className="absolute inset-y-0.5 rounded-sm"
                style={{
                  background: r.change >= 0 ? "var(--s1)" : "var(--s8)",
                  width: `${(Math.abs(r.change) / max) * 50}%`,
                  left: r.change >= 0 ? "50%" : `${50 - (Math.abs(r.change) / max) * 50}%`,
                }}
              />
            </div>
            <span className="text-right text-xs font-medium tabular">
              {r.change >= 0 ? "+" : ""}
              {fmt(r.change)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
