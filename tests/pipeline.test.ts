import { beforeEach, describe, expect, it } from "vitest";
import { all, one, run, resetDbForTests } from "@/lib/db";
import { ingest, type Envelope, type WireEvent } from "@/lib/ingest";
import { parseContext } from "@/lib/query/context";
import { breakdown, cohorts, ecommerce, explore, funnel, overview, paths, realtime } from "@/lib/query/reports";
import { createSite } from "@/lib/sites";

// End-to-end over the real SQL: ingest a few hand-made visits, then check the reports.

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

function visit(cid: string, ua: string, start: number, events: (Omit<WireEvent, "ts"> & { at: number })[], extra: Partial<Envelope> = {}) {
  return ingest(
    { s: "t", cid, e: events.map(({ at, ...e }) => ({ ...e, ts: start + at * 1000 })), ...extra },
    { ip: "1.2.3.4", userAgent: ua, country: "US", now: NOW, trustTimestamps: true },
  );
}
const pv = (u: string, at: number, r?: string): Omit<WireEvent, "ts"> & { at: number } => ({ t: "pageview", u: "https://t.example" + u, r: r ?? null, at });
const ev = (n: string, at: number, extra: Partial<WireEvent> = {}): Omit<WireEvent, "ts"> & { at: number } => ({ t: "event", n, u: "https://t.example/x", at, ...extra });

function ctx(q = "") {
  return parseContext(new URLSearchParams(`site=t&from=2026-10-01&to=2026-10-20${q}`));
}

beforeEach(async () => {
  await resetDbForTests();
  await createSite({ id: "t", name: "Test", domain: "t.example", timezone: "UTC", settings: { identity: "persistent" } });
  await run("INSERT INTO goals(site_id, name, kind, match, value) VALUES ('t', 'Purchase', 'event', 'purchase', 0)");

  const base = NOW - 2 * DAY;
  // 1: search visitor who buys
  await visit("a", CHROME, base, [pv("/", 0, "https://www.google.com/"), pv("/product/kenya", 20), ev("add_to_cart", 30, { p: { item: "Kenya" } }), pv("/checkout", 40), ev("purchase", 60, { rev: 42, p: { item: "Kenya" } })]);
  // 2: email visitor who adds to cart and leaves
  await visit("b", IPHONE, base + 3600_000, [pv("/product/kenya?utm_source=newsletter&utm_medium=email&utm_campaign=oct", 0), ev("add_to_cart", 15, { p: { item: "Kenya" } }), ev("add_to_cart", 20, { p: { item: "Colombia" } })]);
  // 3: direct bounce
  await visit("c", CHROME, base + 7200_000, [pv("/", 0), { t: "page_leave", u: "https://t.example/", v: 3000, p: { sd: 20 }, at: 3 }]);
  // 4: visitor "a" returns a week later (same client id)
  await visit("a", CHROME, base - 7 * DAY, [pv("/", 0, "https://www.google.com/"), pv("/about", 30)]);
});

describe("ingestion and sessionisation", () => {
  it("creates one session per visit and attributes channels", async () => {
    const rows = await all("SELECT channel, utm_campaign, device, pageviews, revenue, conversions FROM sessions ORDER BY started_at");
    expect(rows).toEqual([
      { channel: "Organic Search", utm_campaign: null, device: "Desktop", pageviews: 2, revenue: 0, conversions: 0 },
      { channel: "Organic Search", utm_campaign: null, device: "Desktop", pageviews: 3, revenue: 42, conversions: 1 },
      { channel: "Email", utm_campaign: "oct", device: "Mobile", pageviews: 1, revenue: 0, conversions: 0 },
      { channel: "Direct", utm_campaign: null, device: "Desktop", pageviews: 1, revenue: 0, conversions: 0 },
    ]);
  });

  it("starts a new session after 30 minutes of inactivity", async () => {
    await visit("z", CHROME, NOW - DAY, [pv("/", 0)]);
    await visit("z", CHROME, NOW - DAY, [pv("/later", 31 * 60)]);
    expect((await one<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE visitor_id = (SELECT visitor_id FROM sessions ORDER BY started_at DESC LIMIT 1)"))!.n).toBe(2);
  });

  it("never stores query strings in paths", async () => {
    const paths = await all("SELECT DISTINCT path FROM events WHERE path LIKE '%?%'");
    expect(paths).toEqual([]);
  });
});

describe("reports", () => {
  it("overview KPIs", async () => {
    const o = await overview(await ctx());
    expect(o.current).toMatchObject({ sessions: 4, visitors: 3, pageviews: 7, revenue: 42, conversions: 1 });
    expect(o.current.bounce_rate).toBeCloseTo(0.5); // the email visit and the direct bounce were not engaged
  });

  it("filters apply to every report", async () => {
    expect((await overview(await ctx("&f=channel:Email"))).current.sessions).toBe(1);
    expect((await overview(await ctx("&f=page:/checkout"))).current.sessions).toBe(1);
    expect((await overview(await ctx("&f=device:Mobile"))).current.pageviews).toBe(1);
  });

  it("breakdown by channel", async () => {
    const rows = (await breakdown(await ctx(), "channel")) as { value: string; sessions: number }[];
    expect(Object.fromEntries(rows.map((r) => [r.value, r.sessions]))).toEqual({ "Organic Search": 2, Email: 1, Direct: 1 });
  });

  it("closed funnel counts each step in order", async () => {
    const f = await funnel(await ctx(), [
      { label: "Product", kind: "page", match: "/product/*" },
      { label: "Cart", kind: "event", match: "add_to_cart" },
      { label: "Checkout", kind: "page", match: "/checkout" },
      { label: "Purchase", kind: "event", match: "purchase" },
    ]);
    expect(f.steps.map((s) => s.count)).toEqual([2, 2, 1, 1]);
    expect(f.steps[3].conversion).toBe(0.5);
    expect(f.steps[1].avgTimeFromPrevious).toBe(12_500);
  });

  it("paths show where people went next", async () => {
    const p = await paths(await ctx(), "/");
    expect(p.next.map((n) => [n.value, n.n])).toEqual(
      expect.arrayContaining([
        ["/product/kenya", 1],
        ["/about", 1],
        ["(exit)", 1],
      ]),
    );
  });

  it("e-commerce totals and cart abandonment", async () => {
    const e = await ecommerce(await ctx());
    expect(e).toMatchObject({ revenue: 42, orders: 1, aov: 42 });
    expect(e.cartAbandonment).toBe(0.5);
    // One row per product: grouping by the alias "value" would pick up events.value and merge them all.
    expect(e.products).toEqual([
      { value: "Kenya", added: 2, purchased: 1, revenue: 42 },
      { value: "Colombia", added: 1, purchased: 0, revenue: 0 },
    ]);
  });

  it("cohorts recognise the returning visitor", async () => {
    const c = await cohorts(await ctx(), 4);
    const first = c.cohorts.find((x) => x.size === 1 && x.retention.length > 1);
    expect(first?.retention[1]).toBe(1);
  });

  it("explore groups by several dimensions and rejects unknown ones", async () => {
    const r = await explore(await ctx(), ["channel", "device", "bogus"], ["sessions", "revenue"]);
    expect(r.dims).toEqual(["channel", "device"]);
    expect(r.rows.find((x) => x.channel === "Email")).toMatchObject({ device: "Mobile", sessions: 1 });
    await expect(explore(await ctx(), ["bogus"], ["sessions"])).rejects.toThrow();
  });

  it("realtime buckets live pageviews by minute", async () => {
    await ingest({ s: "t", cid: "live", e: [{ t: "pageview", u: "https://t.example/now" }] }, { ip: "1.2.3.4", userAgent: CHROME, country: "US", now: Date.now() });
    const r = await realtime("t");
    expect(r.active).toBe(1);
    expect(r.minutes.reduce((a, m) => a + m.views, 0)).toBe(1);
    expect(r.pagesNow[0]).toMatchObject({ value: "/now", visitors: 1 });
  });
});
