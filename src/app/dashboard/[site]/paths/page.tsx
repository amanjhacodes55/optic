"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, Loading, PageHeader } from "@/components/ui";
import { num, pct } from "@/lib/format";

type Paths = {
  start: string;
  total: number;
  before: { value: string; n: number }[];
  next: { value: string; n: number; next: { value: string; n: number }[] }[];
  journeys: { journey: string; n: number }[];
};
type PageRow = { value: string; pageviews: number };

export default function PathsPage() {
  const { qs } = useDashboard();
  const [start, setStart] = useState<string | null>(null);
  const { data: pages } = useApi<PageRow[]>(`/api/stats/breakdown?${qs({ dim: "page", limit: 60 })}`);
  const { data, loading } = useApi<Paths>(`/api/stats/paths?${qs({ start: start ?? undefined })}`);
  const pick = (p: string) => !p.startsWith("(") && setStart(p);

  return (
    <>
      <PageHeader
        title="Paths"
        description="What people do before and after a page. Click any page in the flow to re-centre on it."
        actions={
          <select className="input max-w-xs" value={data?.start ?? ""} onChange={(e) => setStart(e.target.value)} aria-label="Page">
            {(pages ?? []).map((p) => (
              <option key={p.value} value={p.value}>
                {p.value}
              </option>
            ))}
          </select>
        }
      />
      {loading && !data ? (
        <Loading height={400} />
      ) : data ? (
        <div className="space-y-4">
          <Card title="Flow" subtitle={`${num(data.total)} views of ${data.start} in this period`}>
            <div className="grid gap-4 overflow-x-auto lg:grid-cols-[1fr_auto_1fr_auto_1.2fr]">
              <Column title="Came from">
                {data.before.map((b) => (
                  <Node key={b.value} label={b.value} n={b.n} total={data.total} onClick={() => pick(b.value)} />
                ))}
              </Column>
              <Arrow />
              <Column title="Page">
                <div className="rounded-lg border-2 border-accent bg-accent-wash p-3">
                  <div className="truncate font-semibold">{data.start}</div>
                  <div className="text-xs text-ink-2 tabular">{num(data.total)} views</div>
                </div>
              </Column>
              <Arrow />
              <Column title="Then went to → and after that">
                {data.next.map((n) => (
                  <div key={n.value} className="space-y-1">
                    <Node label={n.value} n={n.n} total={data.total} onClick={() => pick(n.value)} strong />
                    {n.next.length > 0 && (
                      <div className="ml-5 space-y-1 border-l border-line pl-3">
                        {n.next.map((m) => (
                          <Node key={m.value} label={m.value} n={m.n} total={n.n} onClick={() => pick(m.value)} small />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </Column>
            </div>
          </Card>
          <Card title="Most common journeys" subtitle="The first four pages of each session">
            <ul className="space-y-1.5">
              {data.journeys.map((j) => (
                <li key={j.journey} className="flex items-center justify-between gap-4 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-1">
                    {j.journey.split(" → ").map((p, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        {i > 0 && <ArrowRight size={12} className="text-muted" />}
                        <button className="rounded bg-surface-2 px-1.5 py-0.5 hover:bg-accent-wash" onClick={() => pick(p)}>
                          {p}
                        </button>
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 font-medium tabular">{num(j.n)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden pt-9 text-muted lg:block">
      <ArrowRight size={18} />
    </div>
  );
}

function Node({ label, n, total, onClick, strong, small }: { label: string; n: number; total: number; onClick: () => void; strong?: boolean; small?: boolean }) {
  const share = total ? n / total : 0;
  const special = label.startsWith("(");
  return (
    <button
      onClick={onClick}
      disabled={special}
      className={`relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-md px-2 text-left ${small ? "h-7 text-xs" : "h-8 text-sm"} enabled:hover:bg-surface-2`}
    >
      <span className="absolute inset-y-0.5 left-0 rounded-md" style={{ width: `${share * 100}%`, background: special ? "var(--surface-2)" : "var(--accent-wash)" }} />
      <span className={`relative truncate ${strong ? "font-medium" : ""} ${special ? "italic text-ink-2" : ""}`}>{label}</span>
      <span className="relative shrink-0 tabular text-ink-2">
        {pct(share, 0)} <span className="text-muted">· {num(n)}</span>
      </span>
    </button>
  );
}
