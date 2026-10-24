"use client";

import { DimensionReport } from "@/components/dashboard/report-table";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, PageHeader, StatTile } from "@/components/ui";
import { num, pct } from "@/lib/format";

type Explore = { rows: { visitor_type: string; visitors: number; sessions: number; conversion_rate: number }[] };

export default function AudiencePage() {
  const { qs } = useDashboard();
  const { data } = useApi<Explore>(`/api/stats/explore?${qs({ dim: "visitor_type", metric: ["visitors", "sessions", "conversion_rate"] })}`);
  const rows = data?.rows ?? [];
  const newRow = rows.find((r) => r.visitor_type === "New");
  const ret = rows.find((r) => r.visitor_type === "Returning");
  const total = (newRow?.visitors ?? 0) + (ret?.visitors ?? 0);
  return (
    <>
      <PageHeader title="Audience" description="Who your visitors are: location, language, device and technology, and how many come back." />
      <Card title="New vs returning" className="mb-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile label="New visitors" value={num(newRow?.visitors)} />
          <StatTile label="Returning visitors" value={num(ret?.visitors)} />
          <StatTile label="Returning share" value={total ? pct((ret?.visitors ?? 0) / total) : "–"} />
          <StatTile label="Conv. rate, returning vs new" value={`${pct(ret?.conversion_rate, 1)} vs ${pct(newRow?.conversion_rate, 1)}`} />
        </div>
      </Card>
      <div className="space-y-4">
        <DimensionReport title="Location" dims={[{ dim: "country", label: "Country" }, { dim: "language", label: "Language" }]} />
        <DimensionReport
          title="Technology"
          dims={[
            { dim: "device", label: "Device" },
            { dim: "browser", label: "Browser" },
            { dim: "os", label: "OS" },
            { dim: "screen", label: "Screen" },
            { dim: "platform", label: "Platform" },
          ]}
        />
      </div>
    </>
  );
}
