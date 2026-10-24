"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dimLabel } from "@/components/dashboard/breakdown";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, DataTable, Empty, Loading, PageHeader, Tabs, type Column } from "@/components/ui";
import { duration, money, num } from "@/lib/format";

type Rec = { id: string; path: string; started_at: number; duration: number; clicks: number; rage_clicks: number; errors: number; bytes: number; country: string; device: string; browser: string; os: string; channel: string; pageviews: number; revenue: number };

export default function RecordingsPage() {
  const { qs, href, site } = useDashboard();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "frustrated">("all");
  const { data, loading } = useApi<Rec[]>(`/api/stats/recordings?${qs({ frustrated: filter === "frustrated" ? 1 : undefined })}`);
  const columns: Column<Rec>[] = [
    { key: "started_at", label: "When", render: (r) => new Date(r.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), value: (r) => r.started_at },
    { key: "path", label: "Page", align: "left" },
    { key: "duration", label: "Length", format: (n) => duration(n / 1000) },
    { key: "country", label: "Country", render: (r) => dimLabel("country", r.country ?? "(none)"), value: (r) => r.country ?? "", align: "left" },
    { key: "device", label: "Device", render: (r) => `${r.device} · ${r.browser}`, value: (r) => r.device, align: "left" },
    { key: "channel", label: "Source", align: "left" },
    { key: "clicks", label: "Clicks", format: num },
    {
      key: "rage_clicks",
      label: "Signals",
      render: (r) => (
        <span className="space-x-2 text-xs">
          {r.rage_clicks > 0 && <span style={{ color: "var(--critical)" }}>⚠ {r.rage_clicks} rage</span>}
          {r.errors > 0 && <span style={{ color: "var(--critical)" }}>✕ {r.errors} error{r.errors > 1 ? "s" : ""}</span>}
          {r.revenue > 0 && <span className="text-good-ink">● {money(r.revenue, site?.settings.currency)}</span>}
        </span>
      ),
      value: (r) => r.rage_clicks + r.errors,
    },
  ];
  return (
    <>
      <PageHeader
        title="Session recordings"
        description="Replays of real visits, recorded with rrweb. Text in inputs is masked by default; add the class optic-block to hide an element entirely."
        actions={<Tabs value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "frustrated", label: "Rage clicks or errors" }]} size="md" />}
      />
      <Card pad={false}>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty title="No recordings in this period">
            Recordings appear for visits made with the tracker installed and replay enabled in settings. Seeded demo data has no replays; browse the demo shop to make some.
          </Empty>
        ) : (
          <div className="py-2">
            <DataTable rows={data} columns={columns} initialSort="started_at" onRowClick={(r) => router.push(href(`/recordings/${r.id}`))} />
          </div>
        )}
      </Card>
    </>
  );
}
