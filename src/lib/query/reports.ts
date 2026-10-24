import zlib from "node:zlib";
import type { InValue } from "@libsql/client";
import { all as allRows, one as oneRow } from "../db";
import {
  bucketExpr,
  bucketLabels,
  ENGAGED,
  QueryError,
  SESSION_DIMENSIONS,
  sessionWhere,
  type QueryContext,
  type SessionDimension,
} from "./context";

const all = <T>(sql: string, args: InValue[]) => allRows<T>(sql, args);
const one = <T>(sql: string, args: InValue[]) => oneRow<T>(sql, args) as Promise<T>;

// ---------------------------------------------------------------------------------------------
// Overview

type Kpis = {
  visitors: number;
  sessions: number;
  pageviews: number;
  bounce_rate: number;
  avg_duration: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
  views_per_session: number;
  new_visitors: number;
};

const KPI_SELECT = `
  COUNT(DISTINCT s.visitor_id) AS visitors,
  COUNT(*) AS sessions,
  COALESCE(SUM(s.pageviews), 0) AS pageviews,
  COALESCE(1.0 - AVG(CASE WHEN ${ENGAGED} THEN 1.0 ELSE 0 END), 0) AS bounce_rate,
  COALESCE(AVG(s.last_seen - s.started_at), 0) / 1000.0 AS avg_duration,
  COALESCE(SUM(s.conversions), 0) AS conversions,
  COALESCE(AVG(CASE WHEN s.conversions > 0 THEN 1.0 ELSE 0 END), 0) AS conversion_rate,
  COALESCE(SUM(s.revenue), 0) AS revenue,
  COALESCE(SUM(s.pageviews) * 1.0 / NULLIF(COUNT(*), 0), 0) AS views_per_session,
  COUNT(DISTINCT CASE WHEN s.is_new = 1 THEN s.visitor_id END) AS new_visitors`;

async function kpis(ctx: QueryContext, window: { start: number; end: number }): Promise<Kpis> {
  const w = sessionWhere(ctx, window);
  return await one<Kpis>(`SELECT ${KPI_SELECT} FROM sessions s WHERE ${w.sql}`, w.args);
}

async function series(ctx: QueryContext, window: { start: number; end: number }) {
  const w = sessionWhere(ctx, window);
  const rows = await all<Kpis & { bucket: string }>(
    `SELECT ${bucketExpr(ctx, "s.started_at")} AS bucket, ${KPI_SELECT} FROM sessions s WHERE ${w.sql} GROUP BY bucket ORDER BY bucket`,
    w.args,
  );
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  return bucketLabels(ctx, window).map((label) => {
    const r = byBucket.get(label);
    return {
      label,
      visitors: r?.visitors ?? 0,
      sessions: r?.sessions ?? 0,
      pageviews: r?.pageviews ?? 0,
      bounce_rate: r?.bounce_rate ?? 0,
      avg_duration: r?.avg_duration ?? 0,
      conversions: r?.conversions ?? 0,
      revenue: r?.revenue ?? 0,
    };
  });
}

export async function overview(ctx: QueryContext) {
  // Independent queries run side by side: on a hosted database each one is a network round trip.
  const [current, previous, currentSeries, previousSeries] = await Promise.all([
    kpis(ctx, ctx),
    kpis(ctx, ctx.previous),
    series(ctx, ctx),
    series(ctx, ctx.previous),
  ]);
  return { bucket: ctx.bucket, current, previous, series: currentSeries, previousSeries };
}

// ---------------------------------------------------------------------------------------------
// Breakdowns: one dimension, the standard metric set

export async function breakdown(ctx: QueryContext, dim: string, limit = 50) {
  if (dim === "page") return pages(ctx, limit);
  if (dim === "event") return events(ctx, limit);
  if (!(dim in SESSION_DIMENSIONS)) throw new QueryError("unknown dimension");
  const col = SESSION_DIMENSIONS[dim as SessionDimension];
  const w = sessionWhere(ctx);
  return await all<Record<string, unknown>>(
    `SELECT COALESCE(s.${col}, '(none)') AS value, ${KPI_SELECT}
     FROM sessions s WHERE ${w.sql}
     GROUP BY s.${col} ORDER BY visitors DESC, sessions DESC LIMIT ?`,
    [...w.args, limit],
  );
}

async function pages(ctx: QueryContext, limit: number) {
  const w = sessionWhere(ctx);
  return await all<Record<string, unknown>>(
    `WITH base AS (SELECT s.id, s.entry_page, s.exit_page, s.pageviews FROM sessions s WHERE ${w.sql}),
     pv AS (
       SELECT e.path, COUNT(*) AS pageviews, COUNT(DISTINCT e.visitor_id) AS visitors, COUNT(DISTINCT e.session_id) AS sessions
       FROM events e JOIN base b ON b.id = e.session_id
       WHERE e.type = 'pageview' GROUP BY e.path
     ),
     leave AS (
       SELECT e.path, AVG(e.value) / 1000.0 AS avg_time, AVG(CAST(json_extract(e.props, '$.sd') AS REAL)) AS scroll
       FROM events e JOIN base b ON b.id = e.session_id
       WHERE e.type = 'page_leave' GROUP BY e.path
     ),
     entries AS (SELECT entry_page AS path, COUNT(*) AS entries, AVG(CASE WHEN pageviews <= 1 THEN 1.0 ELSE 0 END) AS single_page FROM base GROUP BY entry_page),
     exits AS (SELECT exit_page AS path, COUNT(*) AS exits FROM base GROUP BY exit_page)
     SELECT pv.path AS value, pv.pageviews, pv.visitors, pv.sessions,
            COALESCE(leave.avg_time, 0) AS avg_time, COALESCE(leave.scroll, 0) AS scroll_depth,
            COALESCE(entries.entries, 0) AS entries, COALESCE(exits.exits, 0) AS exits,
            COALESCE(exits.exits * 1.0 / pv.pageviews, 0) AS exit_rate
     FROM pv
     LEFT JOIN leave ON leave.path = pv.path
     LEFT JOIN entries ON entries.path = pv.path
     LEFT JOIN exits ON exits.path = pv.path
     ORDER BY pv.pageviews DESC LIMIT ?`,
    [...w.args, limit],
  );
}

async function events(ctx: QueryContext, limit: number) {
  const w = sessionWhere(ctx);
  return await all<Record<string, unknown>>(
    `SELECT e.name AS value, COUNT(*) AS events, COUNT(DISTINCT e.visitor_id) AS visitors,
            COUNT(DISTINCT e.session_id) AS sessions, COALESCE(SUM(e.revenue), 0) AS revenue,
            COUNT(*) * 1.0 / NULLIF((SELECT COUNT(*) FROM sessions s WHERE ${w.sql}), 0) AS per_session
     FROM events e JOIN sessions s ON s.id = e.session_id
     WHERE ${w.sql} AND e.type = 'event'
     GROUP BY e.name ORDER BY events DESC LIMIT ?`,
    [...w.args, ...w.args, limit],
  );
}

/** Top values of each property of one event, e.g. which products were added to the cart. */
export async function eventProperties(ctx: QueryContext, name: string) {
  const w = sessionWhere(ctx);
  const rows = await all<{ key: string; value: string; count: number; revenue: number }>(
    `SELECT j.key AS key, CAST(j.value AS TEXT) AS value, COUNT(*) AS count, COALESCE(SUM(e.revenue), 0) AS revenue
     FROM events e JOIN sessions s ON s.id = e.session_id, json_each(e.props) j
     WHERE ${w.sql} AND e.name = ? AND e.props IS NOT NULL
     GROUP BY j.key, j.value ORDER BY count DESC`,
    [...w.args, name],
  );
  const out: Record<string, { value: string; count: number; revenue: number }[]> = {};
  for (const r of rows) {
    const list = (out[r.key] ??= []);
    if (list.length < 10) list.push({ value: r.value, count: r.count, revenue: r.revenue });
  }
  const trend = await all<{ bucket: string; count: number }>(
    `SELECT ${bucketExpr(ctx, "e.ts")} AS bucket, COUNT(*) AS count
     FROM events e JOIN sessions s ON s.id = e.session_id
     WHERE ${w.sql} AND e.name = ? GROUP BY bucket`,
    [...w.args, name],
  );
  const byBucket = new Map(trend.map((t) => [t.bucket, t.count]));
  return { properties: out, series: bucketLabels(ctx).map((label) => ({ label, count: byBucket.get(label) ?? 0 })) };
}

// ---------------------------------------------------------------------------------------------
// Realtime

export async function realtime(siteId: string) {
  const now = Date.now();
  const five = now - 5 * 60_000;
  const thirty = now - 30 * 60_000;
  // Polled every few seconds, so its six queries run side by side.
  const [activeRow, perMinute, pagesNow, sourcesNow, countriesNow, feed] = await Promise.all([
    one<{ n: number }>("SELECT COUNT(DISTINCT visitor_id) AS n FROM sessions WHERE site_id = ? AND last_seen >= ?", [siteId, five]),
    // Bucket by whole minutes ago (0 = the current minute). Bound numbers arrive as REAL, hence the CAST.
    all<{ ago: number; views: number; visitors: number }>(
      `SELECT CAST((? - ts) / 60000 AS INTEGER) AS ago, SUM(type = 'pageview') AS views, COUNT(DISTINCT visitor_id) AS visitors
       FROM events WHERE site_id = ? AND ts > ? AND ts <= ? GROUP BY ago`,
      [now, siteId, thirty, now],
    ),
    all<{ value: string; visitors: number }>(
      `SELECT path AS value, COUNT(DISTINCT visitor_id) AS visitors FROM events
       WHERE site_id = ? AND ts >= ? AND type = 'pageview' GROUP BY path ORDER BY visitors DESC LIMIT 10`,
      [siteId, five],
    ),
    all<{ value: string; visitors: number }>(
      `SELECT channel AS value, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
       WHERE site_id = ? AND last_seen >= ? GROUP BY channel ORDER BY visitors DESC LIMIT 8`,
      [siteId, five],
    ),
    all<{ value: string; visitors: number }>(
      `SELECT COALESCE(country, '(none)') AS value, COUNT(DISTINCT visitor_id) AS visitors FROM sessions
       WHERE site_id = ? AND last_seen >= ? GROUP BY country ORDER BY visitors DESC LIMIT 8`,
      [siteId, five],
    ),
    all<Record<string, unknown>>(
      `SELECT e.ts, e.type, e.name, e.path, e.revenue, s.country, s.device, s.browser, s.channel
       FROM events e JOIN sessions s ON s.id = e.session_id
       WHERE e.site_id = ? AND e.ts >= ? AND e.type IN ('pageview', 'event', 'error')
       ORDER BY e.ts DESC LIMIT 40`,
      [siteId, thirty],
    ),
  ]);
  const active = activeRow.n;
  const minutes = Array.from({ length: 30 }, (_, i) => {
    const r = perMinute.find((p) => p.ago === 29 - i);
    return { label: i === 29 ? "now" : `-${29 - i}m`, views: r?.views ?? 0, visitors: r?.visitors ?? 0 };
  });
  return { active, minutes, pagesNow, sourcesNow, countriesNow, feed, at: now };
}

// ---------------------------------------------------------------------------------------------
// Funnels: a closed funnel, each step must happen after the previous one in the same session

export type FunnelStep = { label: string; kind: "page" | "event"; match: string };

export async function funnel(ctx: QueryContext, steps: FunnelStep[], breakdownDim?: SessionDimension) {
  if (steps.length < 2 || steps.length > 8) throw new QueryError("a funnel needs 2 to 8 steps");
  const w = sessionWhere(ctx);
  const args: InValue[] = [...w.args];
  const cond = (st: FunnelStep) => {
    args.push(st.match);
    return st.kind === "page" ? "e.type = 'pageview' AND e.path GLOB ?" : "e.type = 'event' AND e.name = ?";
  };
  const ctes = [`base AS (SELECT s.id FROM sessions s WHERE ${w.sql})`];
  ctes.push(`s1 AS (SELECT e.session_id AS sid, MIN(e.ts) AS t FROM events e JOIN base b ON b.id = e.session_id WHERE ${cond(steps[0])} GROUP BY e.session_id)`);
  for (let i = 1; i < steps.length; i++) {
    ctes.push(
      `s${i + 1} AS (SELECT p.sid, MIN(e.ts) AS t FROM s${i} p JOIN events e ON e.session_id = p.sid AND e.ts >= p.t WHERE ${cond(steps[i])} GROUP BY p.sid)`,
    );
  }
  const selects = steps.map((_, i) => `(SELECT COUNT(*) FROM s${i + 1}) AS c${i + 1}`);
  const times = steps.slice(1).map((_, i) => `(SELECT AVG(b.t - a.t) FROM s${i + 2} b JOIN s${i + 1} a ON a.sid = b.sid) AS t${i + 2}`);
  const row = await one<Record<string, number | null>>(`WITH ${ctes.join(",\n")} SELECT ${[...selects, ...times].join(", ")}`, args);

  const result = steps.map((st, i) => {
    const count = row[`c${i + 1}`] ?? 0;
    const first = row.c1 ?? 0;
    const prev = i === 0 ? count : (row[`c${i}`] ?? 0);
    return {
      ...st,
      count,
      conversion: first ? count / first : 0,
      fromPrevious: prev ? count / prev : 0,
      dropOff: prev - count,
      avgTimeFromPrevious: i === 0 ? null : (row[`t${i + 1}`] ?? null),
    };
  });

  let segments: { value: string; entered: number; completed: number; rate: number }[] = [];
  if (breakdownDim && breakdownDim in SESSION_DIMENSIONS) {
    const col = SESSION_DIMENSIONS[breakdownDim];
    const last = `s${steps.length}`;
    segments = await all<{ value: string; entered: number; completed: number; rate: number }>(
      `WITH ${ctes.join(",\n")}
       SELECT COALESCE(s.${col}, '(none)') AS value, COUNT(*) AS entered, COUNT(l.sid) AS completed, COUNT(l.sid) * 1.0 / COUNT(*) AS rate
       FROM s1 JOIN sessions s ON s.id = s1.sid LEFT JOIN ${last} l ON l.sid = s1.sid
       GROUP BY s.${col} HAVING entered >= 5 ORDER BY entered DESC LIMIT 10`,
      args,
    );
  }
  return { steps: result, segments };
}

// ---------------------------------------------------------------------------------------------
// Paths: what people do before and after a page

export async function paths(ctx: QueryContext, start?: string) {
  const w = sessionWhere(ctx);
  const startPage =
    start ||
    (
      await one<{ path: string } | undefined>(
        `SELECT s.entry_page AS path FROM sessions s WHERE ${w.sql} GROUP BY s.entry_page ORDER BY COUNT(*) DESC LIMIT 1`,
        w.args,
      )
    )?.path ||
    "/";
  const seq = `WITH base AS (SELECT s.id FROM sessions s WHERE ${w.sql}),
    pv AS (
      SELECT e.session_id, e.path, e.ts,
             LAG(e.path) OVER (PARTITION BY e.session_id ORDER BY e.ts) AS prev,
             LEAD(e.path, 1) OVER (PARTITION BY e.session_id ORDER BY e.ts) AS next1,
             LEAD(e.path, 2) OVER (PARTITION BY e.session_id ORDER BY e.ts) AS next2
      FROM events e JOIN base b ON b.id = e.session_id WHERE e.type = 'pageview'
    )`;
  const flows = await all<{ next1: string; next2: string; n: number }>(
    `${seq} SELECT COALESCE(next1, '(exit)') AS next1, COALESCE(next2, CASE WHEN next1 IS NULL THEN NULL ELSE '(exit)' END) AS next2, COUNT(*) AS n
     FROM pv WHERE path = ? GROUP BY next1, next2 ORDER BY n DESC`,
    [...w.args, startPage],
  );
  const before = await all<{ value: string; n: number }>(
    `${seq} SELECT COALESCE(prev, '(entrance)') AS value, COUNT(*) AS n FROM pv WHERE path = ? GROUP BY prev ORDER BY n DESC LIMIT 8`,
    [...w.args, startPage],
  );
  const journeys = await all<{ journey: string; n: number }>(
    `WITH base AS (SELECT s.id FROM sessions s WHERE ${w.sql}),
     numbered AS (
       SELECT e.session_id, e.path, ROW_NUMBER() OVER (PARTITION BY e.session_id ORDER BY e.ts) AS rn
       FROM events e JOIN base b ON b.id = e.session_id WHERE e.type = 'pageview'
     ),
     j AS (SELECT session_id, GROUP_CONCAT(path, ' → ') AS journey FROM (SELECT * FROM numbered WHERE rn <= 4 ORDER BY session_id, rn) GROUP BY session_id)
     SELECT journey, COUNT(*) AS n FROM j GROUP BY journey ORDER BY n DESC LIMIT 12`,
    w.args,
  );
  const total = flows.reduce((a, f) => a + f.n, 0);
  const level1 = new Map<string, { value: string; n: number; next: { value: string; n: number }[] }>();
  for (const f of flows) {
    const node = level1.get(f.next1) ?? { value: f.next1, n: 0, next: [] };
    node.n += f.n;
    if (f.next2) node.next.push({ value: f.next2, n: f.n });
    level1.set(f.next1, node);
  }
  const next = [...level1.values()].sort((a, b) => b.n - a.n).slice(0, 7).map((n) => ({ ...n, next: n.next.sort((a, b) => b.n - a.n).slice(0, 4) }));
  return { start: startPage, total, before, next, journeys };
}

// ---------------------------------------------------------------------------------------------
// Retention: weekly cohorts by first visit

const WEEK = 7 * 86_400_000;
const MONDAY_SHIFT = 3 * 86_400_000; // 1 Jan 1970 was a Thursday

export async function cohorts(ctx: QueryContext, weeks = 8) {
  const off = Math.trunc(ctx.offsetMs);
  const end = ctx.end;
  const firstWeek = Math.floor((end - 1 + off + MONDAY_SHIFT) / WEEK) - weeks + 1;
  const start = firstWeek * WEEK - MONDAY_SHIFT - off;
  const wk = (col: string) => `CAST((${col} + ${off} + ${MONDAY_SHIFT}) / ${WEEK} AS INTEGER)`;
  const rows = await all<{ cohort: number; offset: number; visitors: number }>(
    // One pass: every session in the window, tagged with its visitor's first-visit week. The
    // visitor index turns the MIN() into a seek, so this stays linear in the number of sessions.
    `WITH tagged AS (
       SELECT s.visitor_id,
              ${wk("s.started_at")} AS week,
              (SELECT ${wk("MIN(f.started_at)")} FROM sessions f WHERE f.site_id = s.site_id AND f.visitor_id = s.visitor_id) AS cohort
       FROM sessions s WHERE s.site_id = ? AND s.started_at >= ? AND s.started_at < ?
     )
     SELECT cohort, week - cohort AS offset, COUNT(DISTINCT visitor_id) AS visitors
     FROM tagged WHERE cohort >= ${wk(String(start))}
     GROUP BY cohort, offset ORDER BY cohort, offset`,
    [ctx.site.id, start, end],
  );
  const byCohort = new Map<number, number[]>();
  for (const r of rows) {
    const arr = byCohort.get(r.cohort) ?? [];
    arr[r.offset] = r.visitors;
    byCohort.set(r.cohort, arr);
  }
  const label = (week: number) => new Date(week * WEEK - MONDAY_SHIFT).toISOString().slice(0, 10);
  const table = [...byCohort.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cohort, arr]) => {
      const size = arr[0] ?? 0;
      return { cohort: label(cohort), size, retention: Array.from({ length: arr.length }, (_, i) => (size ? (arr[i] ?? 0) / size : 0)) };
    });
  const maxLen = Math.max(0, ...table.map((t) => t.retention.length));
  const average = Array.from({ length: maxLen }, (_, i) => {
    const eligible = table.filter((t) => t.retention.length > i && t.size > 0);
    const size = eligible.reduce((a, t) => a + t.size, 0);
    return size ? eligible.reduce((a, t) => a + t.retention[i] * t.size, 0) / size : 0;
  });
  return { identity: ctx.site.settings.identity, cohorts: table, average };
}

// ---------------------------------------------------------------------------------------------
// E-commerce and goals

export async function ecommerce(ctx: QueryContext) {
  const w = sessionWhere(ctx);
  const totals = await one<{ revenue: number; orders: number; buyers: number; sessions: number; carts: number; checkouts: number; cart_buyers: number }>(
    `WITH base AS (SELECT s.id, s.visitor_id FROM sessions s WHERE ${w.sql}),
     ev AS (SELECT e.session_id, e.name, e.revenue FROM events e JOIN base b ON b.id = e.session_id WHERE e.type = 'event' AND e.name IN ('purchase', 'add_to_cart', 'begin_checkout'))
     SELECT
       COALESCE((SELECT SUM(revenue) FROM ev WHERE name = 'purchase'), 0) AS revenue,
       (SELECT COUNT(*) FROM ev WHERE name = 'purchase') AS orders,
       (SELECT COUNT(DISTINCT session_id) FROM ev WHERE name = 'purchase') AS buyers,
       (SELECT COUNT(*) FROM base) AS sessions,
       (SELECT COUNT(DISTINCT session_id) FROM ev WHERE name = 'add_to_cart') AS carts,
       (SELECT COUNT(DISTINCT session_id) FROM ev WHERE name = 'begin_checkout') AS checkouts,
       (SELECT COUNT(DISTINCT a.session_id) FROM ev a JOIN ev p ON p.session_id = a.session_id AND p.name = 'purchase' WHERE a.name = 'add_to_cart') AS cart_buyers`,
    w.args,
  );
  const trend = await all<{ bucket: string; revenue: number; orders: number }>(
    `SELECT ${bucketExpr(ctx, "e.ts")} AS bucket, COALESCE(SUM(e.revenue), 0) AS revenue, COUNT(*) AS orders
     FROM events e JOIN sessions s ON s.id = e.session_id WHERE ${w.sql} AND e.name = 'purchase' GROUP BY bucket`,
    w.args,
  );
  const byBucket = new Map(trend.map((t) => [t.bucket, t]));
  const products = await all<{ value: string; added: number; purchased: number; revenue: number }>(
    `SELECT json_extract(e.props, '$.item') AS value,
            SUM(e.name = 'add_to_cart') AS added, SUM(e.name = 'purchase') AS purchased,
            COALESCE(SUM(CASE WHEN e.name = 'purchase' THEN e.revenue END), 0) AS revenue
     FROM events e JOIN sessions s ON s.id = e.session_id
     WHERE ${w.sql} AND e.name IN ('add_to_cart', 'purchase') AND json_extract(e.props, '$.item') IS NOT NULL
     GROUP BY value ORDER BY revenue DESC, added DESC LIMIT 15`,
    w.args,
  );
  const byChannel = await all<{ value: string; revenue: number; orders: number; sessions: number }>(
    `SELECT s.channel AS value, SUM(s.revenue) AS revenue, SUM(s.revenue > 0) AS orders, COUNT(*) AS sessions
     FROM sessions s WHERE ${w.sql} GROUP BY s.channel ORDER BY revenue DESC`,
    w.args,
  );
  return {
    currency: ctx.site.settings.currency,
    revenue: totals.revenue,
    orders: totals.orders,
    aov: totals.orders ? totals.revenue / totals.orders : 0,
    conversionRate: totals.sessions ? totals.buyers / totals.sessions : 0,
    cartAbandonment: totals.carts ? 1 - totals.cart_buyers / totals.carts : 0,
    checkoutAbandonment: totals.checkouts ? 1 - totals.buyers / totals.checkouts : 0,
    series: bucketLabels(ctx).map((label) => ({ label, revenue: byBucket.get(label)?.revenue ?? 0, orders: byBucket.get(label)?.orders ?? 0 })),
    products,
    byChannel,
  };
}

export async function goals(ctx: QueryContext) {
  const w = sessionWhere(ctx);
  const defs = await all<{ id: number; name: string; kind: string; match: string; value: number }>("SELECT * FROM goals WHERE site_id = ? ORDER BY id", [ctx.site.id]);
  const sessions = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM sessions s WHERE ${w.sql}`, w.args)).n;
  return Promise.all(defs.map(async (g) => {
    const r = await one<{ completions: number; sessions: number; visitors: number; revenue: number }>(
      g.kind === "page"
        ? `SELECT COUNT(*) AS completions, COUNT(DISTINCT e.session_id) AS sessions, COUNT(DISTINCT e.visitor_id) AS visitors, 0 AS revenue
           FROM events e JOIN sessions s ON s.id = e.session_id WHERE ${w.sql} AND e.type = 'pageview' AND e.path GLOB ?`
        : `SELECT COUNT(*) AS completions, COUNT(DISTINCT e.session_id) AS sessions, COUNT(DISTINCT e.visitor_id) AS visitors, COALESCE(SUM(e.revenue), 0) AS revenue
           FROM events e JOIN sessions s ON s.id = e.session_id WHERE ${w.sql} AND e.type = 'event' AND e.name = ?`,
      [...w.args, g.match],
    );
    return { ...g, ...r, rate: sessions ? r.sessions / sessions : 0, worth: r.revenue || r.completions * g.value };
  }));
}

// ---------------------------------------------------------------------------------------------
// Explore: a small, safe pivot over session dimensions

const EXPLORE_DIMS: Record<string, (ctx: QueryContext) => string> = {
  ...Object.fromEntries(Object.entries(SESSION_DIMENSIONS).map(([k, col]) => [k, () => `COALESCE(s.${col}, '(none)')`])),
  date: (ctx) => `strftime('%Y-%m-%d', (s.started_at + ${Math.trunc(ctx.offsetMs)}) / 1000, 'unixepoch')`,
  week: (ctx) => `strftime('%Y-W%W', (s.started_at + ${Math.trunc(ctx.offsetMs)}) / 1000, 'unixepoch')`,
  hour_of_day: (ctx) => `strftime('%H', (s.started_at + ${Math.trunc(ctx.offsetMs)}) / 1000, 'unixepoch')`,
  day_of_week: (ctx) =>
    `CASE strftime('%w', (s.started_at + ${Math.trunc(ctx.offsetMs)}) / 1000, 'unixepoch') WHEN '0' THEN '7 Sun' WHEN '1' THEN '1 Mon' WHEN '2' THEN '2 Tue' WHEN '3' THEN '3 Wed' WHEN '4' THEN '4 Thu' WHEN '5' THEN '5 Fri' ELSE '6 Sat' END`,
  visitor_type: () => `CASE WHEN s.is_new = 1 THEN 'New' ELSE 'Returning' END`,
};

const EXPLORE_METRICS: Record<string, string> = {
  visitors: "COUNT(DISTINCT s.visitor_id)",
  sessions: "COUNT(*)",
  pageviews: "SUM(s.pageviews)",
  views_per_session: "SUM(s.pageviews) * 1.0 / COUNT(*)",
  bounce_rate: `1.0 - AVG(CASE WHEN ${ENGAGED} THEN 1.0 ELSE 0 END)`,
  engagement_rate: `AVG(CASE WHEN ${ENGAGED} THEN 1.0 ELSE 0 END)`,
  avg_duration: "AVG(s.last_seen - s.started_at) / 1000.0",
  conversions: "SUM(s.conversions)",
  conversion_rate: "AVG(CASE WHEN s.conversions > 0 THEN 1.0 ELSE 0 END)",
  revenue: "SUM(s.revenue)",
  revenue_per_session: "SUM(s.revenue) / COUNT(*)",
};

export const EXPLORE = { dims: Object.keys(EXPLORE_DIMS), metrics: Object.keys(EXPLORE_METRICS) };

export async function explore(ctx: QueryContext, dims: string[], metrics: string[], sort?: string, limit = 200) {
  const d = dims.filter((x) => x in EXPLORE_DIMS).slice(0, 3);
  const m = metrics.filter((x) => x in EXPLORE_METRICS).slice(0, 8);
  if (!d.length || !m.length) throw new QueryError("pick at least one dimension and one metric");
  const w = sessionWhere(ctx);
  const orderBy = sort && m.includes(sort) ? sort : d[0] === "date" || d[0] === "week" || d[0] === "hour_of_day" || d[0] === "day_of_week" ? d[0] : m[0];
  const dir = orderBy === d[0] && d[0] in { date: 1, week: 1, hour_of_day: 1, day_of_week: 1 } ? "ASC" : "DESC";
  const rows = await all<Record<string, string | number>>(
    `SELECT ${d.map((x) => `${EXPLORE_DIMS[x](ctx)} AS ${x}`).join(", ")}, ${m.map((x) => `COALESCE(${EXPLORE_METRICS[x]}, 0) AS ${x}`).join(", ")}
     FROM sessions s WHERE ${w.sql} GROUP BY ${d.map((_, i) => i + 1).join(", ")} ORDER BY ${orderBy} ${dir} LIMIT ?`,
    [...w.args, Math.min(limit, 1000)],
  );
  return { dims: d, metrics: m, rows };
}

// ---------------------------------------------------------------------------------------------
// Heatmaps and scroll depth

export async function heatmap(ctx: QueryContext, path: string, device: "desktop" | "mobile") {
  const vw = device === "mobile" ? "c.vw < 768" : "c.vw >= 768";
  const clicks = await all<{ x: number; y: number; rage: number; dead: number }>(
    `SELECT c.x, c.y, c.rage, c.dead FROM clicks c WHERE c.site_id = ? AND c.path = ? AND c.ts >= ? AND c.ts < ? AND ${vw} LIMIT 30000`,
    [ctx.site.id, path, ctx.start, ctx.end],
  );
  const selectors = await all<{ selector: string; clicks: number; rage: number; dead: number }>(
    `SELECT COALESCE(c.selector, '(unknown)') AS selector, COUNT(*) AS clicks, SUM(c.rage) AS rage, SUM(c.dead) AS dead
     FROM clicks c WHERE c.site_id = ? AND c.path = ? AND c.ts >= ? AND c.ts < ? AND ${vw}
     GROUP BY c.selector ORDER BY clicks DESC LIMIT 12`,
    [ctx.site.id, path, ctx.start, ctx.end],
  );
  const depths = await all<{ sd: number }>(
    `SELECT CAST(json_extract(e.props, '$.sd') AS INTEGER) AS sd FROM events e
     WHERE e.site_id = ? AND e.path = ? AND e.ts >= ? AND e.ts < ? AND e.type = 'page_leave' AND json_extract(e.props, '$.sd') IS NOT NULL`,
    [ctx.site.id, path, ctx.start, ctx.end],
  );
  const scroll = Array.from({ length: 11 }, (_, i) => ({
    depth: i * 10,
    reached: depths.length ? depths.filter((d) => d.sd >= i * 10).length / depths.length : 0,
  }));
  const pageList = await all<{ path: string; clicks: number }>(
    `SELECT path, COUNT(*) AS clicks FROM clicks WHERE site_id = ? AND ts >= ? AND ts < ? GROUP BY path ORDER BY clicks DESC LIMIT 30`,
    [ctx.site.id, ctx.start, ctx.end],
  );
  return { path, device, clicks, selectors, scroll, pages: pageList, domain: ctx.site.domain };
}

// ---------------------------------------------------------------------------------------------
// Session recordings

export async function recordings(ctx: QueryContext, opts: { frustrated?: boolean; path?: string } = {}) {
  const w = sessionWhere(ctx);
  const extra: string[] = [];
  const args: InValue[] = [...w.args];
  if (opts.frustrated) extra.push("(r.rage_clicks > 0 OR r.errors > 0)");
  if (opts.path) {
    extra.push("r.path = ?");
    args.push(opts.path);
  }
  return await all<Record<string, unknown>>(
    `SELECT r.id, r.path, r.started_at, r.last_at, (r.last_at - r.started_at) AS duration, r.clicks, r.rage_clicks, r.errors, r.bytes,
            s.country, s.device, s.browser, s.os, s.channel, s.pageviews, s.revenue
     FROM recordings r JOIN sessions s ON s.id = r.session_id
     WHERE ${w.sql} ${extra.length ? "AND " + extra.join(" AND ") : ""}
     ORDER BY r.started_at DESC LIMIT 100`,
    args,
  );
}

export async function recording(siteId: string, id: string) {
  const meta = await one<({ session_id: string; started_at: number; last_at: number } & Record<string, unknown>) | undefined>(
    `SELECT r.*, s.country, s.device, s.browser, s.os, s.channel, s.entry_page, s.referrer_domain
     FROM recordings r JOIN sessions s ON s.id = r.session_id WHERE r.site_id = ? AND r.id = ?`,
    [siteId, id],
  );
  if (!meta) throw new QueryError("recording not found", 404);
  const chunks = await all<{ data: ArrayBuffer }>("SELECT data FROM recording_chunks WHERE recording_id = ? ORDER BY seq", [id]);
  const events = chunks.flatMap((c) => JSON.parse(zlib.gunzipSync(Buffer.from(c.data)).toString("utf8")) as unknown[]);
  const timeline = await all<{ ts: number; type: string; name: string; path: string }>(
    "SELECT ts, type, name, path FROM events WHERE session_id = ? AND ts >= ? AND ts <= ? AND type IN ('pageview', 'event', 'error') ORDER BY ts",
    [meta.session_id, meta.started_at, meta.last_at + 1000],
  );
  return { meta, events, timeline };
}
