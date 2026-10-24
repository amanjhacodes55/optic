"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWidth } from "@/components/charts";
import { dimLabel } from "@/components/dashboard/breakdown";
import { send, useApi, useDashboard } from "@/components/dashboard/state";
import { Card, Empty, ErrorNote, Loading, PageHeader, Tabs } from "@/components/ui";
import { duration, num, pct } from "@/lib/format";

type Step = { label: string; kind: "page" | "event"; match: string };
type FunnelDef = { id: number; name: string; steps: Step[] };
type Result = {
  steps: (Step & { count: number; conversion: number; fromPrevious: number; dropOff: number; avgTimeFromPrevious: number | null })[];
  segments: { value: string; entered: number; completed: number; rate: number }[];
};

export default function FunnelsPage() {
  const { siteId, qs, site } = useDashboard();
  const { data: funnels, reload } = useApi<FunnelDef[]>(`/api/sites/${siteId}/funnels`);
  const [picked, setPicked] = useState<number | null>(null);
  const [by, setBy] = useState("device");
  const [building, setBuilding] = useState(false);
  const current = funnels?.find((f) => f.id === picked) ?? funnels?.[0];
  const { data, error, loading } = useApi<Result>(current ? `/api/stats/funnel?${qs({ id: current.id, by })}` : null);

  return (
    <>
      <PageHeader
        title="Funnels"
        description="A closed funnel: each step must happen after the previous one, in the same session. Page steps accept * wildcards."
        actions={
          <>
            {funnels && funnels.length > 0 && (
              <select className="input" value={current?.id} onChange={(e) => setPicked(Number(e.target.value))} aria-label="Funnel">
                {funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
            {site?.can_edit && (
              <button className="btn" onClick={() => setBuilding((b) => !b)}>
                <Plus size={15} /> New funnel
              </button>
            )}
          </>
        }
      />
      {building && (
        <FunnelBuilder
          onSaved={(id) => {
            setBuilding(false);
            setPicked(id);
            reload();
          }}
        />
      )}
      {funnels && funnels.length === 0 && !building && (
        <Card>
          <Empty title="No funnels yet">Create one to see where people drop off between steps such as product view, add to cart and purchase.</Empty>
        </Card>
      )}
      {error && <ErrorNote message={error} />}
      {current && (
        <div className="space-y-4">
          <Card
            title={current.name}
            subtitle={data ? `${pct(data.steps[data.steps.length - 1]?.conversion, 1)} of sessions that started the funnel completed it` : undefined}
            actions={
              !site?.can_edit ? undefined : (
                <button
                  className="btn h-8 px-2 text-xs"
                  onClick={async () => {
                    if (!confirm(`Delete the funnel "${current.name}"?`)) return;
                    await send(`/api/sites/${siteId}/funnels?item=${current.id}`, "DELETE");
                    setPicked(null);
                    reload();
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              )
            }
          >
            {loading && !data ? <Loading height={300} /> : data ? <FunnelChart steps={data.steps} /> : null}
          </Card>
          {data && (
            <Card
              title="Completion by segment"
              actions={
                <Tabs
                  value={by}
                  onChange={setBy}
                  options={[
                    { value: "device", label: "Device" },
                    { value: "channel", label: "Channel" },
                    { value: "country", label: "Country" },
                    { value: "browser", label: "Browser" },
                  ]}
                />
              }
            >
              <SegmentBars rows={data.segments} dim={by} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function FunnelChart({ steps }: { steps: Result["steps"] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 260;
  const max = Math.max(1, steps[0]?.count ?? 1);
  const slot = width / Math.max(1, steps.length);
  const bw = Math.min(120, slot * 0.55);
  return (
    <div>
      <div ref={ref} className="w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Funnel">
            {steps.map((s, i) => {
              const h = (s.count / max) * (height - 30);
              const x = i * slot + (slot - bw) / 2;
              const prevH = i === 0 ? h : (steps[i - 1].count / max) * (height - 30);
              return (
                <g key={i}>
                  {i > 0 && <rect x={x} y={height - prevH} width={bw} height={prevH - h} fill="var(--accent-wash)" rx={4} />}
                  <path
                    d={`M${x},${height}V${height - h + Math.min(4, h)}Q${x},${height - h} ${x + 4},${height - h}H${x + bw - 4}Q${x + bw},${height - h} ${x + bw},${height - h + Math.min(4, h)}V${height}Z`}
                    fill="var(--s1)"
                  />
                  <text x={x + bw / 2} y={height - h - 8} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--ink)" className="tabular">
                    {pct(s.conversion, 1)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <div key={i} className="min-w-0 rounded-lg bg-surface-2 p-3 text-sm">
            <div className="truncate font-medium">
              {i + 1}. {s.label}
            </div>
            <div className="truncate text-xs text-muted">
              {s.kind === "page" ? "Page" : "Event"} <code>{s.match}</code>
            </div>
            <div className="mt-2 text-lg font-semibold tabular">{num(s.count)}</div>
            {i > 0 && (
              <div className="text-xs text-ink-2">
                {pct(s.fromPrevious, 1)} of previous · <span style={{ color: "var(--critical)" }}>−{num(s.dropOff)}</span>
                {s.avgTimeFromPrevious != null && <div>avg. {duration(s.avgTimeFromPrevious / 1000)} from previous</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentBars({ rows, dim }: { rows: Result["segments"]; dim: string }) {
  if (!rows.length) return <Empty title="Not enough data to split this funnel" />;
  const max = Math.max(...rows.map((r) => r.rate), 0.0001);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-ink-2">
          <th className="py-1 text-left font-medium">Segment</th>
          <th className="py-1 text-right font-medium">Entered</th>
          <th className="py-1 text-right font-medium">Completed</th>
          <th className="w-1/2 py-1 pl-4 text-left font-medium">Completion rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.value} className="border-t border-line">
            <td className="py-2">{dimLabel(dim, r.value)}</td>
            <td className="py-2 text-right tabular">{num(r.entered)}</td>
            <td className="py-2 text-right tabular">{num(r.completed)}</td>
            <td className="py-2 pl-4">
              <div className="flex items-center gap-2">
                <div className="h-3 rounded-r" style={{ width: `${(r.rate / max) * 80}%`, background: "var(--s1)" }} />
                <span className="text-xs font-medium tabular">{pct(r.rate, 1)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FunnelBuilder({ onSaved }: { onSaved: (id: number) => void }) {
  const { siteId } = useDashboard();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([
    { label: "Visited pricing", kind: "page", match: "/pricing" },
    { label: "Signed up", kind: "event", match: "signup" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card title="New funnel" className="mb-4">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = (await send(`/api/sites/${siteId}/funnels`, "POST", { name, steps })) as { id: number };
            onSaved(r.id);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <input className="input w-full max-w-sm" placeholder="Funnel name" required value={name} onChange={(e) => setName(e.target.value)} />
        {steps.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-sm font-medium text-muted">{i + 1}.</span>
            <input className="input w-48" placeholder="Label" value={s.label} onChange={(e) => update(i, { label: e.target.value })} required />
            <select className="input" value={s.kind} onChange={(e) => update(i, { kind: e.target.value as Step["kind"] })}>
              <option value="page">Page path</option>
              <option value="event">Event name</option>
            </select>
            <input
              className="input w-64"
              placeholder={s.kind === "page" ? "/checkout or /product/*" : "purchase"}
              value={s.match}
              onChange={(e) => update(i, { match: e.target.value })}
              required
            />
            {steps.length > 2 && (
              <button type="button" className="btn px-2" aria-label="Remove step" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          {steps.length < 8 && (
            <button type="button" className="btn" onClick={() => setSteps((s) => [...s, { label: "", kind: "page", match: "" }])}>
              <Plus size={14} /> Add step
            </button>
          )}
          <button className="btn btn-primary">Save funnel</button>
        </div>
        {error && <ErrorNote message={error} />}
      </form>
    </Card>
  );
}
