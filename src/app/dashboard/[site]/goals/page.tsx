"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { send, useApi, useDashboard } from "@/components/dashboard/state";
import { Card, DataTable, ErrorNote, Loading, PageHeader, type Column } from "@/components/ui";
import { money, num, pct } from "@/lib/format";

type Goal = {
  id: number;
  name: string;
  kind: "event" | "page";
  match: string;
  value: number;
  completions: number;
  sessions: number;
  visitors: number;
  rate: number;
  worth: number;
};

export default function GoalsPage() {
  const { qs, siteId, site } = useDashboard();
  const { data, loading, reload } = useApi<Goal[]>(`/api/stats/goals?${qs()}`);
  const [adding, setAdding] = useState(false);
  const cur = site?.settings.currency;
  const columns: Column<Goal>[] = [
    { key: "name", label: "Goal", render: (g) => <span className="font-medium">{g.name}</span>, value: (g) => g.name },
    {
      key: "match",
      label: "Trigger",
      render: (g) => (
        <span className="text-ink-2">
          {g.kind === "event" ? "Event" : "Page"} <code>{g.match}</code>
        </span>
      ),
      value: (g) => g.match,
      align: "left",
    },
    { key: "completions", label: "Completions", format: num },
    { key: "visitors", label: "Visitors", format: num },
    { key: "rate", label: "Conv. rate", format: (n) => pct(n, 2) },
    { key: "worth", label: "Value", format: (n) => (n ? money(n, cur) : "–") },
    {
      key: "id",
      label: "",
      render: (g) =>
        !site?.can_edit ? null : (
          <button
            className="text-muted hover:text-ink"
            aria-label={`Delete goal ${g.name}`}
            onClick={async (e) => {
              e.stopPropagation();
              if (!confirm(`Delete the goal "${g.name}"?`)) return;
              await send(`/api/sites/${siteId}/goals?item=${g.id}`, "DELETE");
              reload();
            }}
          >
            <Trash2 size={14} />
          </button>
        ),
      value: () => 0,
    },
  ];
  return (
    <>
      <PageHeader
        title="Goals"
        description="Conversions you care about: an event (macro: purchase, micro: add_to_cart) or reaching a page. Goals count from the moment they are created."
        actions={
          site?.can_edit ? (
            <button className="btn" onClick={() => setAdding((a) => !a)}>
              <Plus size={15} /> New goal
            </button>
          ) : undefined
        }
      />
      {adding && (
        <GoalForm
          onSaved={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      <Card pad={false}>
        <div className="py-2">
          {loading && !data ? <Loading /> : <DataTable rows={data ?? []} columns={columns} initialSort="completions" exportName="optic-goals" />}
        </div>
      </Card>
    </>
  );
}

function GoalForm({ onSaved }: { onSaved: () => void }) {
  const { siteId } = useDashboard();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"event" | "page">("event");
  const [match, setMatch] = useState("");
  const [value, setValue] = useState("0");
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="New goal" className="mb-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await send(`/api/sites/${siteId}/goals`, "POST", { name, kind, match, value: Number(value) || 0 });
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="label">Name</span>
          <input className="input w-52" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Signed up" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Type</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "event" | "page")}>
            <option value="event">Event</option>
            <option value="page">Page visit</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">{kind === "event" ? "Event name" : "Page path (* allowed)"}</span>
          <input
            className="input w-56"
            required
            value={match}
            onChange={(e) => setMatch(e.target.value)}
            placeholder={kind === "event" ? "signup" : "/thank-you"}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Value per completion</span>
          <input className="input w-28" type="number" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button className="btn btn-primary">Save</button>
        {error && <ErrorNote message={error} />}
      </form>
    </Card>
  );
}
