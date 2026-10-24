import { db } from "../db";
import { contributions, detectAnomalies, holtWinters, quantile } from "../stats";
import { bucketLabels, localDay, SESSION_DIMENSIONS, sessionWhere, type QueryContext, type SessionDimension } from "./context";

const DAY = 86_400_000;

type Metric = "sessions" | "visitors" | "conversions" | "revenue";
const METRIC_SQL: Record<Metric, string> = {
  sessions: "COUNT(*)",
  visitors: "COUNT(DISTINCT s.visitor_id)",
  conversions: "SUM(s.conversions)",
  revenue: "SUM(s.revenue)",
};

function dailySeries(ctx: QueryContext, metric: Metric, start: number, end: number) {
  const w = sessionWhere(ctx, { start, end });
  const rows = db()
    .prepare(
      `SELECT strftime('%Y-%m-%d', (s.started_at + ${Math.trunc(ctx.offsetMs)}) / 1000, 'unixepoch') AS day, COALESCE(${METRIC_SQL[metric]}, 0) AS v
       FROM sessions s WHERE ${w.sql} GROUP BY day`,
    )
    .all(...w.args) as { day: string; v: number }[];
  const map = new Map(rows.map((r) => [r.day, r.v]));
  return bucketLabels({ ...ctx, bucket: "day" }, { start, end }).map((label) => ({ label, value: map.get(label) ?? 0 }));
}

export function insights(ctx: QueryContext, metric: Metric = "sessions") {
  // Always look at whole days, with eight extra weeks of history so the detectors have a baseline.
  const todayStart = Date.parse(localDay(Date.now(), ctx.offsetMs) + "T00:00:00Z") - ctx.offsetMs;
  const end = Math.min(ctx.end, todayStart); // today is partial; leave it out
  const histStart = Math.min(ctx.start, end - 28 * DAY) - 56 * DAY;
  const history = dailySeries(ctx, metric, histStart, end);
  const anomalies = detectAnomalies(history).filter((a) => Date.parse(a.label) >= Date.parse(ctx.from));

  const fitWindow = history.slice(-84);
  const hw = holtWinters(fitWindow.map((h) => h.value), 14);
  const lastDay = Date.parse(history[history.length - 1]?.label ?? ctx.to);
  const forecast = hw.forecast.map((v, i) => ({
    label: new Date(lastDay + (i + 1) * DAY).toISOString().slice(0, 10),
    value: v,
    low: hw.low[i],
    high: hw.high[i],
  }));
  const recent = history.filter((h) => Date.parse(h.label) >= Date.parse(ctx.from));

  return {
    metric,
    history: recent,
    anomalies,
    forecast,
    forecastTotal: forecast.reduce((a, f) => a + f.value, 0),
    model: { kind: "Holt-Winters (additive, weekly season)", ...hw.params },
    changes: whatChanged(ctx, metric),
    frustration: frustration(ctx),
    vitals: vitals(ctx),
  };
}

function whatChanged(ctx: QueryContext, metric: Metric) {
  const dims: SessionDimension[] = ["channel", "country", "device", "entry_page", "browser"];
  return dims.map((dim) => {
    const col = SESSION_DIMENSIONS[dim];
    const grab = (window: { start: number; end: number }) => {
      const w = sessionWhere(ctx, window);
      const rows = db()
        .prepare(`SELECT COALESCE(s.${col}, '(none)') AS k, COALESCE(${METRIC_SQL[metric]}, 0) AS v FROM sessions s WHERE ${w.sql} GROUP BY s.${col}`)
        .all(...w.args) as { k: string; v: number }[];
      return new Map(rows.map((r) => [r.k, r.v]));
    };
    return { dim, ...contributions(grab(ctx), grab(ctx.previous), 5) };
  });
}

function frustration(ctx: QueryContext) {
  const conn = db();
  const rage = conn
    .prepare(
      `SELECT path, COALESCE(selector, '(unknown)') AS selector, SUM(rage) AS rage, SUM(dead) AS dead, COUNT(DISTINCT session_id) AS sessions
       FROM clicks WHERE site_id = ? AND ts >= ? AND ts < ? AND (rage = 1 OR dead = 1)
       GROUP BY path, selector ORDER BY rage DESC, dead DESC LIMIT 8`,
    )
    .all(ctx.site.id, ctx.start, ctx.end);
  const errors = conn
    .prepare(
      `SELECT COALESCE(json_extract(props, '$.message'), name) AS message, path, COUNT(*) AS count, COUNT(DISTINCT session_id) AS sessions, MAX(ts) AS last_seen
       FROM events WHERE site_id = ? AND ts >= ? AND ts < ? AND type = 'error'
       GROUP BY message, path ORDER BY count DESC LIMIT 8`,
    )
    .all(ctx.site.id, ctx.start, ctx.end);
  return { rage, errors };
}

const VITAL_THRESHOLDS: Record<string, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800] };

function vitals(ctx: QueryContext) {
  const rows = db()
    .prepare(`SELECT name, path, value FROM events WHERE site_id = ? AND ts >= ? AND ts < ? AND type = 'vital' AND value IS NOT NULL`)
    .all(ctx.site.id, ctx.start, ctx.end) as { name: string; path: string; value: number }[];
  const byName = new Map<string, number[]>();
  const byPage = new Map<string, number[]>();
  for (const r of rows) {
    (byName.get(r.name) ?? byName.set(r.name, []).get(r.name)!).push(r.value);
    if (r.name === "LCP") (byPage.get(r.path) ?? byPage.set(r.path, []).get(r.path)!).push(r.value);
  }
  const rate = (name: string, v: number) => {
    const t = VITAL_THRESHOLDS[name];
    if (!t) return "good";
    return v <= t[0] ? "good" : v <= t[1] ? "needs-improvement" : "poor";
  };
  const summary = [...byName.entries()].map(([name, vals]) => {
    const p75 = quantile(vals, 0.75);
    return { name, p75, samples: vals.length, rating: rate(name, p75) };
  });
  const slowPages = [...byPage.entries()]
    .filter(([, v]) => v.length >= 5)
    .map(([path, v]) => ({ path, p75: quantile(v, 0.75), samples: v.length, rating: rate("LCP", quantile(v, 0.75)) }))
    .sort((a, b) => b.p75 - a.p75)
    .slice(0, 8);
  return { summary, slowPages };
}
