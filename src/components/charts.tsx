"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { longDate, shortDate } from "@/lib/format";

// Hand-rolled SVG charts. Specs: 2px lines, ~10% area wash, hairline solid grid, ≤24px bars with
// a 4px rounded data end, ≥8px markers with a 2px surface ring, text always in ink tokens.

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export type Series = { key: string; label: string; values: (number | null)[]; color: string; kind?: "area" | "line" | "compare" };

type LineChartProps = {
  labels: string[];
  series: Series[];
  format: (n: number) => string;
  height?: number;
  /** Optional uncertainty band drawn behind the series (e.g. a forecast interval). */
  band?: { low: (number | null)[]; high: (number | null)[]; color: string; label: string };
  markers?: { index: number; title: string; tone: "critical" | "good" }[];
  compareLabels?: string[];
  formatLabel?: (label: string) => string;
  tooltipTitle?: (label: string) => string;
};

export function LineChart({ labels, series, format, height = 240, band, markers = [], compareLabels, formatLabel = shortDate, tooltipTitle = longDate }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 48, padR = 12, padT = 12, padB = 26;
  const innerW = Math.max(10, width - padL - padR);
  const innerH = height - padT - padB;
  const n = labels.length;

  const max = useMemo(() => {
    let m = 0;
    for (const s of series) for (const v of s.values) if (v != null && v > m) m = v;
    if (band) for (const v of band.high) if (v != null && v > m) m = v;
    return m;
  }, [series, band]);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / top) * innerH;

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const area = (vals: (number | null)[]) => {
    const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean) as number[][];
    if (pts.length < 2) return "";
    return `M${pts[0][0]},${y(0)}` + pts.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("") + `L${pts[pts.length - 1][0]},${y(0)}Z`;
  };
  const bandPath = band
    ? (() => {
        const idx = band.high.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
        if (idx.length < 2) return "";
        return "M" + idx.map((i) => `${x(i)},${y(band.high[i]!)}`).join("L") + "L" + [...idx].reverse().map((i) => `${x(i)},${y(band.low[i]!)}`).join("L") + "Z";
      })()
    : "";

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 80))));
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / innerW) * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ") + " over time"}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 ? (
              <text key={l + i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">
                {formatLabel(l)}
              </text>
            ) : null,
          )}
          {band && bandPath && <path d={bandPath} fill={band.color} opacity={0.14} />}
          {series.map((s) =>
            s.kind === "area" ? <path key={s.key + "a"} d={area(s.values)} fill={s.color} opacity={0.1} /> : null,
          )}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {markers.map((m) => {
            const v = series[0]?.values[m.index];
            if (v == null) return null;
            return (
              <g key={m.index}>
                <circle cx={x(m.index)} cy={y(v)} r={6} fill={m.tone === "critical" ? "var(--critical)" : "var(--good)"} stroke="var(--surface)" strokeWidth={2} />
              </g>
            );
          })}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--axis)" strokeWidth={1} />
              {series.map((s) => {
                const v = s.values[hover];
                return v == null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
              })}
            </g>
          )}
          <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {hover != null && width > 0 && (
        <Tooltip x={x(hover)} width={width}>
          <div className="mb-1 font-medium text-ink">{tooltipTitle(labels[hover])}</div>
          {series.map((s) => {
            const v = s.values[hover];
            if (v == null) return null;
            const lab = s.kind === "compare" && compareLabels ? `${s.label} (${compareLabels[hover] ?? ""})` : s.label;
            return (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                  {lab}
                </span>
                <span className="tabular font-medium text-ink">{format(v)}</span>
              </div>
            );
          })}
          {band && band.low[hover] != null && (
            <div className="mt-1 text-ink-2">
              {band.label}: <span className="tabular">{format(band.low[hover]!)}</span> – <span className="tabular">{format(band.high[hover]!)}</span>
            </div>
          )}
          {markers.filter((m) => m.index === hover).map((m) => (
            <div key={m.index} className="mt-1 flex items-center gap-1 font-medium" style={{ color: m.tone === "critical" ? "var(--critical)" : "var(--good-ink)" }}>
              ⚠ {m.title}
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = x > width * 0.62;
  return (
    <div
      className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={left ? { right: width - x + 12 } : { left: x + 12 }}
    >
      {children}
    </div>
  );
}

/** Vertical columns: one series across categories or time (realtime minutes, funnel steps). */
export function ColumnChart({
  labels,
  values,
  format,
  height = 160,
  color = "var(--s1)",
  showLabels = true,
  tooltip,
}: {
  labels: string[];
  values: number[];
  format: (n: number) => string;
  height?: number;
  color?: string;
  showLabels?: boolean;
  tooltip?: (i: number) => ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padB = showLabels ? 22 : 4;
  const padT = 8;
  const innerH = height - padB - padT;
  const max = Math.max(1, ...values);
  const slot = width / Math.max(1, values.length);
  const bw = Math.min(24, Math.max(2, slot - 2));
  const every = Math.max(1, Math.ceil(values.length / Math.max(2, Math.floor(width / 60))));
  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img">
          <line x1={0} x2={width} y1={padT + innerH} y2={padT + innerH} stroke="var(--axis)" />
          {values.map((v, i) => {
            const h = (v / max) * innerH;
            const bx = i * slot + (slot - bw) / 2;
            const by = padT + innerH - h;
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
                {h > 0 && (
                  <path
                    d={`M${bx},${padT + innerH}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + bw - r}Q${bx + bw},${by} ${bx + bw},${by + r}V${padT + innerH}Z`}
                    fill={color}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                )}
                {showLabels && i % every === 0 && (
                  <text x={i * slot + slot / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
                    {labels[i]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && width > 0 && (
        <Tooltip x={hover * slot + slot / 2} width={width}>
          {tooltip ? tooltip(hover) : (
            <>
              <div className="font-medium text-ink">{labels[hover]}</div>
              <div className="tabular text-ink-2">{format(values[hover])}</div>
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}

export function Sparkline({ values, color = "var(--s1)", height = 28 }: { values: number[]; color?: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = Math.max(...values, 0) || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * (width - 4) + 2},${height - 2 - (v / max) * (height - 4)}`);
  return (
    <div ref={ref} className="w-full" style={{ height }} aria-hidden>
      {width > 0 && values.length > 1 && (
        <svg width={width} height={height}>
          <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

/** Ranked list with a wash bar behind each row — the workhorse of the overview. */
export function BarList({
  rows,
  format,
  onSelect,
  color = "var(--accent-wash)",
  empty = "No data for this period",
  renderLabel,
}: {
  rows: { label: string; value: number; secondary?: string }[];
  format: (n: number) => string;
  onSelect?: (label: string) => void;
  color?: string;
  empty?: string;
  renderLabel?: (label: string) => ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.label}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(r.label)}
            className="group relative flex h-8 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm enabled:hover:bg-surface-2"
            title={onSelect ? `Filter by ${r.label}` : r.label}
          >
            <span className="absolute inset-y-0.5 left-0 rounded-md" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
            <span className="relative truncate text-ink">{renderLabel ? renderLabel(r.label) : r.label}</span>
            <span className="relative flex shrink-0 items-center gap-3 tabular">
              {r.secondary && <span className="text-xs text-muted">{r.secondary}</span>}
              <span className="font-medium text-ink">{format(r.value)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
