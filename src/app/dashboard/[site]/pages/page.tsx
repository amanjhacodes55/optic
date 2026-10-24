"use client";

import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, DataTable, Loading, PageHeader, type Column } from "@/components/ui";
import { duration, num, pct } from "@/lib/format";

type Row = { value: string; pageviews: number; visitors: number; sessions: number; avg_time: number; scroll_depth: number; entries: number; exits: number; exit_rate: number };

export default function PagesPage() {
  const { qs, addFilter } = useDashboard();
  const { data, loading } = useApi<Row[]>(`/api/stats/breakdown?${qs({ dim: "page", limit: 500 })}`);
  const columns: Column<Row>[] = [
    { key: "value", label: "Page" },
    { key: "pageviews", label: "Pageviews", format: num },
    { key: "visitors", label: "Visitors", format: num },
    { key: "avg_time", label: "Avg. engaged time", format: duration },
    { key: "scroll_depth", label: "Avg. scroll", format: (n) => `${Math.round(n)}%` },
    { key: "entries", label: "Entrances", format: num },
    { key: "exits", label: "Exits", format: num },
    { key: "exit_rate", label: "Exit rate", format: (n) => pct(n) },
  ];
  return (
    <>
      <PageHeader
        title="Pages"
        description="Engaged time counts only while the tab is visible. Scroll is the deepest point reached, as a share of the page's height."
      />
      <Card pad={false}>
        <div className="py-2">
          {loading && !data ? <Loading height={300} /> : <DataTable rows={data ?? []} columns={columns} initialSort="pageviews" onRowClick={(r) => addFilter("page", r.value)} exportName="optic-pages" />}
        </div>
      </Card>
    </>
  );
}
