"use client";

import { ColumnChart, BarList } from "@/components/charts";
import { dimLabel } from "@/components/dashboard/breakdown";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, Loading, PageHeader } from "@/components/ui";
import { countryName, flag } from "@/lib/geo";
import { money, num, timeAgo } from "@/lib/format";

type Realtime = {
  active: number;
  minutes: { label: string; views: number; visitors: number }[];
  pagesNow: { value: string; visitors: number }[];
  sourcesNow: { value: string; visitors: number }[];
  countriesNow: { value: string; visitors: number }[];
  feed: { ts: number; type: string; name: string; path: string; revenue: number | null; country: string; device: string; browser: string; channel: string }[];
  at: number;
};

export default function RealtimePage() {
  const { siteId, site } = useDashboard();
  const { data } = useApi<Realtime>(`/api/stats/realtime?site=${siteId}`, { refreshMs: 5000 });
  return (
    <>
      <PageHeader title="Realtime" description="Activity in the last 30 minutes, refreshed every 5 seconds." />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Pageviews per minute" subtitle="Last 30 minutes">
            <div className="mb-4 flex items-baseline gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--good)" }} />
                <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: "var(--good)" }} />
              </span>
              <span className="text-5xl font-semibold tracking-tight">{data.active}</span>
              <span className="text-sm text-ink-2">visitors on the site in the last 5 minutes</span>
            </div>
            <ColumnChart labels={data.minutes.map((m) => m.label)} values={data.minutes.map((m) => m.views)} format={(n) => `${n} pageviews`} height={170} />
          </Card>
          <Card title="Live feed">
            <ul className="max-h-[420px] space-y-2 overflow-y-auto text-sm">
              {data.feed.length === 0 && <li className="py-8 text-center text-muted">Waiting for activity…</li>}
              {data.feed.map((e, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5" aria-hidden>
                    {flag(e.country)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {e.type === "pageview" ? (
                        <>
                          Viewed <span className="font-medium">{e.path}</span>
                        </>
                      ) : e.type === "error" ? (
                        <span style={{ color: "var(--critical)" }}>⚠ JavaScript error on {e.path}</span>
                      ) : (
                        <>
                          <span className="font-medium">{e.name}</span>
                          {e.revenue ? <span className="text-good-ink"> · {money(e.revenue, site?.settings.currency)}</span> : null}
                        </>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {countryName(e.country)} · {e.device} · {e.channel} · {timeAgo(e.ts)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Top pages now">
            <BarList rows={data.pagesNow.map((r) => ({ label: r.value, value: r.visitors }))} format={num} empty="No one is browsing right now" />
          </Card>
          <Card title="Sources now">
            <BarList rows={data.sourcesNow.map((r) => ({ label: r.value, value: r.visitors }))} format={num} empty="–" />
          </Card>
          <Card title="Countries now">
            <BarList rows={data.countriesNow.map((r) => ({ label: r.value, value: r.visitors }))} format={num} renderLabel={(v) => dimLabel("country", v)} empty="–" />
          </Card>
        </div>
      )}
    </>
  );
}
