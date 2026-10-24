"use client";

import Link from "next/link";
import { useState } from "react";
import { LineChart } from "@/components/charts";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, Empty, Loading, PageHeader, Tabs } from "@/components/ui";
import { num, pct, shortDate } from "@/lib/format";

type Cohorts = { identity: string; cohorts: { cohort: string; size: number; retention: number[] }[]; average: number[] };

// Sequential blue ramp, light to dark. Text inside a cell switches to white on the darker steps.
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];

export default function RetentionPage() {
  const { qs, href } = useDashboard();
  const [weeks, setWeeks] = useState("8");
  const { data, loading } = useApi<Cohorts>(`/api/stats/cohorts?${qs({ weeks })}`);
  const max = data ? Math.max(0.0001, ...data.cohorts.flatMap((c) => c.retention.slice(1))) : 1;
  const color = (v: number) => RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1)))];

  return (
    <>
      <PageHeader
        title="Retention"
        description="Weekly cohorts by first visit. Each cell is the share of a cohort that came back in that week."
        actions={<Tabs value={weeks} onChange={setWeeks} options={[{ value: "6", label: "6 weeks" }, { value: "8", label: "8 weeks" }, { value: "12", label: "12 weeks" }]} />}
      />
      {data?.identity === "cookieless" && (
        <div className="mb-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
          This site uses cookieless identity, which resets every day, so returning visitors cannot be recognised and retention will look close to zero.
          Switch to persistent identity in <Link className="text-accent-ink underline" href={href("/settings")}>settings</Link> if your privacy policy allows it.
        </div>
      )}
      {loading && !data ? (
        <Loading height={400} />
      ) : !data || data.cohorts.length === 0 ? (
        <Card>
          <Empty title="No cohorts in this period" />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card title="Average retention curve" subtitle="Weighted by cohort size">
            <LineChart
              height={200}
              labels={data.average.map((_, i) => `Week ${i}`)}
              formatLabel={(l) => l}
              tooltipTitle={(l) => l}
              format={(n) => pct(n, 1)}
              series={[{ key: "avg", label: "Returning", values: data.average.map((v, i) => (i === 0 ? null : v)), color: "var(--s1)", kind: "area" }]}
            />
          </Card>
          <Card title="Cohort table" pad={false}>
            <div className="overflow-x-auto p-4">
              <table className="w-full border-separate text-sm" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr className="text-xs text-ink-2">
                    <th className="px-2 py-1 text-left font-medium">First visit week</th>
                    <th className="px-2 py-1 text-right font-medium">Visitors</th>
                    {data.average.map((_, i) => (
                      <th key={i} className="px-2 py-1 text-center font-medium">
                        W{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.cohort}>
                      <td className="whitespace-nowrap px-2 py-1">Week of {shortDate(c.cohort)}</td>
                      <td className="px-2 py-1 text-right tabular">{num(c.size)}</td>
                      {data.average.map((_, i) => {
                        const v = c.retention[i];
                        if (v == null) return <td key={i} />;
                        if (i === 0) return <td key={i} className="rounded px-2 py-1 text-center text-xs text-ink-2 tabular bg-surface-2">100%</td>;
                        const bg = color(v);
                        const dark = RAMP.indexOf(bg) >= 6;
                        return (
                          <td key={i} className="rounded px-2 py-1 text-center text-xs font-medium tabular" style={{ background: bg, color: dark ? "#fff" : "#0b0b0b" }} title={`${pct(v, 2)} of ${num(c.size)}`}>
                            {pct(v, 1)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
