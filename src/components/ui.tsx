"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Sparkline } from "./charts";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = "", pad = true }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Delta({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-xs text-muted">new</span>;
  if (Math.abs(value) < 0.0005) return <span className="text-xs text-muted">±0%</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium tabular" style={{ color: good ? "var(--good-ink)" : "var(--critical)" }}>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(value * 100).toFixed(1)}%
      <span className="sr-only">{good ? "better" : "worse"} than the previous period</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  goodWhenUp = true,
  trend,
  active,
  onClick,
}: {
  label: string;
  value: string;
  delta?: number | null;
  goodWhenUp?: boolean;
  trend?: number[];
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`min-w-0 rounded-xl border px-4 py-3 text-left transition-colors ${active ? "border-accent bg-accent-wash" : "border-line bg-surface enabled:hover:bg-surface-2"}`}
    >
      <div className="truncate text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="whitespace-nowrap text-2xl font-semibold tracking-tight">{value}</span>
        {delta !== undefined && <Delta value={delta} goodWhenUp={goodWhenUp} />}
      </div>
      {trend && trend.length > 1 && (
        <div className="mt-1">
          <Sparkline values={trend} color={active ? "var(--s1)" : "var(--muted)"} />
        </div>
      )}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, options, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; size?: "sm" | "md" }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 ${size === "sm" ? "h-7 text-xs" : "h-8 text-sm"} font-medium transition-colors ${o.value === value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ height = 200, label = "Loading" }: { height?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted" style={{ height }} role="status">
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}…
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">⚠ {message}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export type Column<R> = {
  key: string;
  label: string;
  render?: (row: R) => ReactNode;
  value?: (row: R) => number | string;
  format?: (v: number) => string;
  align?: "left" | "right";
  width?: string;
};

export function DataTable<R extends Record<string, unknown>>({
  rows,
  columns,
  onRowClick,
  initialSort,
  exportName,
  maxRows = 100,
}: {
  rows: R[];
  columns: Column<R>[];
  onRowClick?: (row: R) => void;
  initialSort?: string;
  exportName?: string;
  maxRows?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ? { key: initialSort, dir: -1 } : null);
  const [all, setAll] = useState(false);
  const get = (row: R, c: Column<R>) => (c.value ? c.value(row) : (row[c.key] as number | string));
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find((x) => x.key === sort.key);
    if (!c) return rows;
    return [...rows].sort((a, b) => {
      const va = get(a, c), vb = get(b, c);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, columns]);
  const shown = all ? sorted : sorted.slice(0, maxRows);

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [columns.map((c) => esc(c.label)).join(","), ...sorted.map((r) => columns.map((c) => esc(get(r, c))).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${exportName ?? "optic-export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!rows.length) return <Empty title="No data for this period" />;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-2">
              {columns.map((c, i) => (
                <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-medium ${c.align === "left" || (i === 0 && c.align !== "right") ? "text-left" : "text-right"}`} style={{ width: c.width }}>
                  <button className="hover:text-ink" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((-s.dir) as 1 | -1) : -1 }))}>
                    {c.label}
                    {sort?.key === c.key && <span aria-hidden> {sort.dir === -1 ? "↓" : "↑"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, ri) => (
              <tr key={ri} onClick={onRowClick ? () => onRowClick(row) : undefined} className={`border-b border-line last:border-0 ${onRowClick ? "cursor-pointer hover:bg-surface-2" : ""}`}>
                {columns.map((c, i) => {
                  const v = get(row, c);
                  const left = c.align === "left" || (i === 0 && c.align !== "right");
                  return (
                    <td key={c.key} className={`px-3 py-2 ${left ? "max-w-[22rem] truncate text-left" : "text-right tabular"}`}>
                      {c.render ? c.render(row) : c.format && typeof v === "number" ? c.format(v) : String(v ?? "–")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 pt-3 text-xs text-muted">
        <span>
          {shown.length} of {rows.length} rows
          {sorted.length > maxRows && (
            <button className="ml-2 text-accent-ink hover:underline" onClick={() => setAll((a) => !a)}>
              {all ? "Show fewer" : "Show all"}
            </button>
          )}
        </span>
        {exportName && (
          <button className="text-accent-ink hover:underline" onClick={exportCsv}>
            Export CSV
          </button>
        )}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
