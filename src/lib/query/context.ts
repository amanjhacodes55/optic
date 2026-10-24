import { getSite, type Site } from "../sites";

// Every report takes the same inputs: a site, a date range in the site's time zone, optional
// filters and an optional comparison with the previous period of equal length.

export const SESSION_DIMENSIONS = {
  channel: "channel",
  referrer: "referrer_domain",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_term: "utm_term",
  utm_content: "utm_content",
  country: "country",
  device: "device",
  browser: "browser",
  os: "os",
  language: "language",
  platform: "platform",
  entry_page: "entry_page",
  exit_page: "exit_page",
  screen: "screen",
} as const;
export type SessionDimension = keyof typeof SESSION_DIMENSIONS;

export type Filter = { dim: SessionDimension | "page" | "event"; value: string };

export type QueryContext = {
  site: Site;
  from: string;
  to: string;
  start: number;
  end: number;
  offsetMs: number;
  bucket: "hour" | "day";
  filters: Filter[];
  previous: { start: number; end: number };
};

/** Offset of a time zone from UTC at a given instant, in ms. */
export function tzOffsetMs(timeZone: string, at: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(at));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - Math.floor(at / 1000) * 1000;
  } catch {
    return 0;
  }
}

export function localDay(ts: number, offsetMs: number): string {
  return new Date(ts + offsetMs).toISOString().slice(0, 10);
}

const DAY = 86_400_000;

export function parseContext(params: URLSearchParams): QueryContext {
  const siteId = params.get("site") ?? "";
  const site = getSite(siteId);
  if (!site) throw new QueryError("unknown site", 404);
  const offsetMs = tzOffsetMs(site.timezone, Date.now());
  const today = localDay(Date.now(), offsetMs);

  const isDay = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  let to = isDay(params.get("to")) ? params.get("to")! : today;
  let from = isDay(params.get("from")) ? params.get("from")! : new Date(Date.parse(to) - 29 * DAY).toISOString().slice(0, 10);
  if (from > to) [from, to] = [to, from];

  const start = Date.parse(from + "T00:00:00Z") - offsetMs;
  const end = Date.parse(to + "T00:00:00Z") + DAY - offsetMs;
  const length = end - start;

  const filters: Filter[] = [];
  for (const raw of params.getAll("f")) {
    const i = raw.indexOf(":");
    if (i < 1) continue;
    const dim = raw.slice(0, i);
    const value = raw.slice(i + 1);
    if (dim in SESSION_DIMENSIONS || dim === "page" || dim === "event") filters.push({ dim: dim as Filter["dim"], value });
  }

  return {
    site,
    from,
    to,
    start,
    end,
    offsetMs,
    bucket: length <= 2 * DAY ? "hour" : "day",
    filters,
    previous: { start: start - length, end: start },
  };
}

/**
 * WHERE clause over the sessions table (alias `s`) for a site, a time window and the filters.
 * Values are always bound as parameters; dimension names come from a fixed allow-list.
 */
export function sessionWhere(ctx: QueryContext, window: { start: number; end: number } = ctx): { sql: string; args: unknown[] } {
  const parts = ["s.site_id = ?", "s.started_at >= ?", "s.started_at < ?"];
  const args: unknown[] = [ctx.site.id, window.start, window.end];
  for (const f of ctx.filters) {
    if (f.dim === "page") {
      parts.push("EXISTS (SELECT 1 FROM events fe WHERE fe.session_id = s.id AND fe.type = 'pageview' AND fe.path = ?)");
      args.push(f.value);
    } else if (f.dim === "event") {
      parts.push("EXISTS (SELECT 1 FROM events fe WHERE fe.session_id = s.id AND fe.name = ?)");
      args.push(f.value);
    } else {
      const col = SESSION_DIMENSIONS[f.dim];
      if (f.value === "(none)") parts.push(`s.${col} IS NULL`);
      else {
        parts.push(`s.${col} = ?`);
        args.push(f.value);
      }
    }
  }
  return { sql: parts.join(" AND "), args };
}

export function bucketExpr(ctx: QueryContext, column: string): string {
  const fmt = ctx.bucket === "hour" ? "%Y-%m-%d %H:00" : "%Y-%m-%d";
  return `strftime('${fmt}', (${column} + ${Math.trunc(ctx.offsetMs)}) / 1000, 'unixepoch')`;
}

/** All bucket labels in the range, so charts show zeros instead of skipping empty days. */
export function bucketLabels(ctx: QueryContext, window: { start: number; end: number } = ctx): string[] {
  const out: string[] = [];
  const step = ctx.bucket === "hour" ? 3_600_000 : DAY;
  for (let t = window.start; t < window.end; t += step) {
    const iso = new Date(t + ctx.offsetMs).toISOString();
    out.push(ctx.bucket === "hour" ? iso.slice(0, 13).replace("T", " ") + ":00" : iso.slice(0, 10));
  }
  return out;
}

// GA4's definition: a session is engaged if it lasted 10s+, saw 2+ pages or converted.
export const ENGAGED = "(s.engaged_ms >= 10000 OR s.pageviews >= 2 OR s.conversions > 0)";

export class QueryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
