"use client";

import { useState } from "react";
import { BarList, LineChart } from "@/components/charts";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, DataTable, Empty, Loading, PageHeader, type Column } from "@/components/ui";
import { money, num } from "@/lib/format";

type Row = { value: string; events: number; visitors: number; sessions: number; revenue: number; per_session: number };
type Detail = { properties: Record<string, { value: string; count: number; revenue: number }[]>; series: { label: string; count: number }[] };

export default function EventsPage() {
  const { qs, site } = useDashboard();
  const { data, loading } = useApi<Row[]>(`/api/stats/breakdown?${qs({ dim: "event", limit: 200 })}`);
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? data?.[0]?.value ?? null;
  const { data: detail } = useApi<Detail>(current ? `/api/stats/event?${qs({ name: current })}` : null);
  const columns: Column<Row>[] = [
    { key: "value", label: "Event", render: (r) => <span className={r.value === current ? "font-semibold text-accent-ink" : ""}>{r.value}</span>, value: (r) => r.value },
    { key: "events", label: "Count", format: num },
    { key: "visitors", label: "Visitors", format: num },
    { key: "per_session", label: "Per session", format: (n) => n.toFixed(3) },
    { key: "revenue", label: "Revenue", format: (n) => (n ? money(n, site?.settings.currency) : "–") },
  ];
  return (
    <>
      <PageHeader
        title="Events"
        description={
          <>
            Custom events from <code>optic(&quot;event&quot;, …)</code>, <code>data-optic-event</code> attributes and tag-manager rules, plus automatic outbound
            clicks, downloads, form submits and video plays.
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card pad={false} title="All events">
          <div className="py-2">{loading && !data ? <Loading /> : <DataTable rows={data ?? []} columns={columns} initialSort="events" onRowClick={(r) => setSelected(r.value)} exportName="optic-events" />}</div>
        </Card>
        <div className="space-y-4">
          <Card title={current ? <code>{current}</code> : "Event"} subtitle="Count over time">
            {detail ? (
              <LineChart height={180} labels={detail.series.map((s) => s.label)} series={[{ key: "c", label: current ?? "", values: detail.series.map((s) => s.count), color: "var(--s1)", kind: "area" }]} format={num} />
            ) : (
              <Loading height={180} />
            )}
          </Card>
          <Card title="Properties" subtitle="Top values of each property sent with this event">
            {!detail ? (
              <Loading height={120} />
            ) : Object.keys(detail.properties).length === 0 ? (
              <Empty title="No properties">Send an object as the second argument to attach properties.</Empty>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {Object.entries(detail.properties).map(([key, values]) => (
                  <div key={key}>
                    <div className="mb-1 px-2 text-xs font-semibold text-ink-2">{key}</div>
                    <BarList rows={values.map((v) => ({ label: v.value, value: v.count }))} format={num} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
