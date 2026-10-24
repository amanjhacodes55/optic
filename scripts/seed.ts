// Fills the database with ~4 months of realistic traffic for the Northwind Coffee demo shop.
// Everything goes through the real ingestion code, so seeded data is shaped exactly like live data.
//
//   npm run seed                 # 120 days into ./data/optic.db
//   SEED_DAYS=30 npm run seed    # smaller
//   SEED_RESET=1 npm run seed    # wipe the demo site first
import { batch, one, run } from "../src/lib/db";
import { ingest, type WireEvent } from "../src/lib/ingest";
import { createSite, deleteSite, getSite } from "../src/lib/sites";
import layout from "./demo-layout.json";

const DAYS = Number(process.env.SEED_DAYS ?? 120);
const SITE_ID = "demo";
const DOMAIN = new URL(process.env.OPTIC_URL ?? "http://localhost:3000").host;
const TIMEZONE = "Asia/Kolkata";
const DAY = 86_400_000;

// ---- deterministic randomness -----------------------------------------------------------------
let seed = 0x5eed5;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const chance = (p: number) => rand() < p;
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
function normal() {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}
const lognormal = (median: number, sigma: number) => median * Math.exp(sigma * normal());
function pick<T>(items: readonly T[], weights?: readonly number[]): T {
  if (!weights) return items[Math.floor(rand() * items.length)];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]) <= 0) return items[i];
  return items[items.length - 1];
}
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("");

// ---- the shop -----------------------------------------------------------------------------------
const PRODUCTS = [
  { slug: "ethiopia-yirgacheffe", name: "Ethiopia Yirgacheffe", price: 18, w: 1.2 },
  { slug: "colombia-huila", name: "Colombia Huila", price: 16, w: 1.6 },
  { slug: "sumatra-mandheling", name: "Sumatra Mandheling", price: 17, w: 0.8 },
  { slug: "kenya-aa", name: "Kenya AA", price: 21, w: 0.7 },
  { slug: "house-espresso", name: "House Espresso", price: 15, w: 1.8 },
  { slug: "decaf-swiss-water", name: "Decaf Swiss Water", price: 17, w: 0.5 },
];
const TITLES: Record<string, string> = {
  "/demo": "Northwind Coffee",
  "/demo/shop": "Shop — Northwind Coffee",
  "/demo/cart": "Cart — Northwind Coffee",
  "/demo/checkout": "Checkout — Northwind Coffee",
  "/demo/thank-you": "Thank you — Northwind Coffee",
  "/demo/brewing-guide": "Brewing guide — Northwind Coffee",
  "/demo/about": "About — Northwind Coffee",
};

type Device = "desktop" | "mobile" | "tablet";
const UAS: Record<Device, [string, number][]> = {
  desktop: [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", 38],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", 20],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15", 16],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0", 12],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0", 8],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", 4],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0", 2],
  ],
  mobile: [
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", 46],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36", 36],
    ["Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36", 12],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1", 6],
  ],
  tablet: [
    ["Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", 70],
    ["Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36", 30],
  ],
};
const SCREENS: Record<Device, [number, number][]> = {
  desktop: [[1920, 1080], [1440, 900], [1536, 864], [2560, 1440], [1366, 768]],
  mobile: [[390, 844], [393, 873], [412, 915], [375, 812], [430, 932]],
  tablet: [[820, 1180], [1024, 1366], [800, 1280]],
};
const COUNTRIES: [string, number, string][] = [
  ["US", 32, "en-US"], ["IN", 15, "en-IN"], ["GB", 10, "en-GB"], ["DE", 7, "de-DE"], ["CA", 6, "en-CA"], ["AU", 5, "en-AU"],
  ["FR", 4, "fr-FR"], ["NL", 3, "nl-NL"], ["BR", 3, "pt-BR"], ["JP", 2, "ja-JP"], ["SG", 2, "en-SG"], ["SE", 2, "sv-SE"],
  ["ES", 2, "es-ES"], ["IT", 2, "it-IT"], ["IE", 1, "en-IE"], ["MX", 1, "es-MX"], ["AE", 1, "en-AE"], ["ZA", 1, "en-ZA"],
];

type Source = { referrer?: string; query?: string; landing: string };
type ChannelSpec = { name: string; weight: number; buy: number; source: () => Source };
const productLanding = () => "/demo/product/" + pick(PRODUCTS, PRODUCTS.map((p) => p.w)).slug;
const CHANNELS: ChannelSpec[] = [
  { name: "search", weight: 34, buy: 1.0, source: () => ({ referrer: pick(["https://www.google.com/", "https://www.bing.com/", "https://duckduckgo.com/", "https://www.ecosia.org/"], [86, 7, 5, 2]), landing: pick(["/demo/brewing-guide", "/demo", productLanding(), "/demo/shop"], [38, 30, 22, 10]) }) },
  { name: "direct", weight: 24, buy: 1.25, source: () => ({ landing: pick(["/demo", "/demo/shop", productLanding()], [70, 18, 12]) }) },
  { name: "social", weight: 12, buy: 0.55, source: () => ({ referrer: pick(["https://t.co/", "https://www.reddit.com/r/Coffee/", "https://www.instagram.com/", "https://www.facebook.com/", "https://www.linkedin.com/"], [25, 30, 25, 12, 8]), landing: pick(["/demo", "/demo/about", "/demo/brewing-guide", productLanding()], [40, 15, 25, 20]) }) },
  { name: "paid_search", weight: 10, buy: 1.5, source: () => ({ query: `utm_source=google&utm_medium=cpc&utm_campaign=${pick(["brand", "coffee-beans", "espresso"], [3, 5, 2])}&gclid=${hex(8)}`, landing: pick([productLanding(), "/demo/shop"], [60, 40]) }) },
  { name: "referral", weight: 8, buy: 0.9, source: () => ({ referrer: pick(["https://www.coffeegeek.com/forums/", "https://medium.com/@brewing/best-beans", "https://news.ycombinator.com/", "https://www.producthunt.com/"], [40, 30, 15, 15]), landing: pick(["/demo", "/demo/brewing-guide", productLanding()], [45, 25, 30]) }) },
  { name: "email", weight: 7, buy: 2.4, source: () => ({ query: `utm_source=newsletter&utm_medium=email&utm_campaign=${pick(["monthly-roast", "restock-kenya", "holiday-gifts"], [6, 3, 1])}`, landing: pick(["/demo/shop", productLanding()], [55, 45]) }) },
  { name: "paid_social", weight: 5, buy: 0.8, source: () => ({ query: `utm_source=${pick(["facebook", "instagram"])}&utm_medium=paid_social&utm_campaign=retargeting&fbclid=${hex(8)}`, landing: productLanding() }) },
];

// ---- layout-aware clicks ------------------------------------------------------------------------
type Box = { selector: string; x: number; y: number; w: number; h: number; interactive: boolean };
type Layout = Record<string, Record<string, { height: number; width: number; boxes: Box[] }>>;
const L = layout as Layout;
function routeKey(path: string) {
  return path.startsWith("/demo/product/") ? "/demo/product/colombia-huila" : path;
}
function boxes(device: Device, path: string, selector?: string): Box[] {
  const page = L[device === "mobile" ? "mobile" : "desktop"][routeKey(path)];
  if (!page) return [];
  return selector ? page.boxes.filter((b) => b.selector === selector) : page.boxes;
}
function clickOn(device: Device, path: string, selector: string, vw: number, nth?: number): WireEvent | null {
  const list = boxes(device, path, selector);
  if (!list.length) return null;
  const b = nth != null ? list[Math.min(nth, list.length - 1)] : pick(list);
  const page = L[device === "mobile" ? "mobile" : "desktop"][routeKey(path)];
  const px = b.x + b.w * (0.5 + normal() * 0.18);
  const py = b.y + b.h * (0.5 + normal() * 0.18);
  return { t: "click", u: "https://" + DOMAIN + path, x: Math.min(1, Math.max(0, px / page.width)), y: Math.round(Math.max(0, py)), vw, sel: selector };
}

// ---- one visit ----------------------------------------------------------------------------------
type Visitor = { cid: string; device: Device; ua: string; screen: [number, number]; country: string; lang: string; firstDay: number; loyal: number };

function newVisitor(day: number): Visitor {
  const device = pick<Device>(["desktop", "mobile", "tablet"], [50, 44, 6]);
  const ua = pick(UAS[device].map((u) => u[0]), UAS[device].map((u) => u[1]));
  const c = pick(COUNTRIES, COUNTRIES.map((x) => x[1]));
  return { cid: hex(24), device, ua, screen: pick(SCREENS[device]), country: c[0], lang: c[2], firstDay: day, loyal: rand() };
}

function nextPage(path: string, cart: number, buyBias: number): string | null {
  const exit = { "/demo": 0.38, "/demo/shop": 0.3, "/demo/cart": 0.25, "/demo/checkout": 0.34, "/demo/thank-you": 0.6, "/demo/brewing-guide": 0.62, "/demo/about": 0.5 }[path] ?? 0.42;
  if (chance(Math.min(0.9, exit / Math.sqrt(buyBias)))) return null;
  if (path === "/demo") return pick(["/demo/shop", productLanding(), "/demo/brewing-guide", "/demo/about"], [44, 34, 12, 10]);
  if (path === "/demo/shop") return productLanding();
  if (path.startsWith("/demo/product/")) return chance(0.27 * buyBias) ? "ADD" : pick(["/demo/shop", productLanding(), cart ? "/demo/cart" : "/demo"], [50, 35, 15]);
  if (path === "/demo/cart") return cart ? (chance(0.58 * Math.min(1.3, buyBias)) ? "/demo/checkout" : pick(["/demo/shop", productLanding()])) : "/demo/shop";
  if (path === "/demo/checkout") return chance(0.5 * Math.min(1.25, buyBias)) ? "BUY" : "/demo/cart";
  if (path === "/demo/brewing-guide") return pick(["/demo/shop", productLanding(), "/demo"], [50, 35, 15]);
  if (path === "/demo/about") return pick(["/demo/shop", "/demo"], [70, 30]);
  return "/demo/shop";
}

const NAV_CLICK: Record<string, (to: string) => [string, number?] | null> = {
  "/demo": (to) => (to === "/demo/shop" ? [pick(["#hero-shop", ".top nav a"]), 0] : to.startsWith("/demo/product/") ? [".card"] : to === "/demo/brewing-guide" ? [".hero .btn.secondary"] : [".top nav a", 2]),
  "/demo/shop": () => [".card"],
  "/demo/cart": (to) => (to === "/demo/checkout" ? ["#checkout-btn"] : [".top nav a", 0]),
  "/demo/brewing-guide": () => [".top nav a", 0],
  "/demo/about": () => [".top nav a", 0],
};

function visit(v: Visitor, start: number, spec: ChannelSpec, mult: { buy: number }) {
  const events: WireEvent[] = [];
  const src = spec.source();
  const vw = v.device === "desktop" ? Math.min(v.screen[0], 1440) : v.screen[0];
  const deviceBuy = v.device === "mobile" ? 0.62 : v.device === "tablet" ? 0.85 : 1.15;
  const buyBias = spec.buy * deviceBuy * mult.buy * (0.75 + v.loyal * 0.6);
  let t = start;
  let path = src.landing;
  let first = true;
  let cart: { name: string; price: number; qty: number }[] = [];
  let pages = 0;

  const url = (p: string, q?: string) => "https://" + DOMAIN + p + (q ? "?" + q : "");
  while (path && pages < 14) {
    pages++;
    const product = path.startsWith("/demo/product/") ? PRODUCTS.find((p) => path.endsWith(p.slug)) : undefined;
    events.push({ t: "pageview", u: url(path, first ? src.query : undefined), r: first ? (src.referrer ?? null) : url("/demo"), ti: product ? product.name + " — Northwind Coffee" : (TITLES[path] ?? "Northwind Coffee"), ts: t });

    if (first) {
      const slow = (v.device === "mobile" ? 1.55 : 1) * (product ? 1.35 : 1) * (v.country === "IN" || v.country === "BR" ? 1.3 : 1);
      events.push({ t: "vital", n: "LCP", u: url(path), v: Math.round(lognormal(1500 * slow, 0.35)), ts: t + 2500 });
      events.push({ t: "vital", n: "FCP", u: url(path), v: Math.round(lognormal(900 * slow, 0.3)), ts: t + 2500 });
      events.push({ t: "vital", n: "TTFB", u: url(path), v: Math.round(lognormal(260 * slow, 0.4)), ts: t + 2500 });
      events.push({ t: "vital", n: "CLS", u: url(path), v: Math.round(Math.abs(normal()) * (product ? 0.09 : 0.04) * 1000) / 1000, ts: t + 2500 });
      if (chance(0.6)) events.push({ t: "vital", n: "INP", u: url(path), v: Math.round(lognormal(120 * slow, 0.45)), ts: t + 4000 });
    }
    first = false;
    const pageMark = events.length;

    // Time on page and scroll depth depend on the kind of page.
    const reading = path === "/demo/brewing-guide" || path === "/demo/about";
    let dwell = Math.round(Math.min(600_000, lognormal(reading ? 48_000 : path === "/demo/checkout" ? 55_000 : 17_000, 0.75)));
    let scroll = Math.min(100, Math.round(reading ? 45 + rand() * 60 : path === "/demo" ? 35 + rand() * 70 : 50 + rand() * 55));

    // Idle clicks on non-interactive elements: these show up as dead clicks.
    if (chance(0.12)) {
      const deadTargets = boxes(v.device, path).filter((b) => !b.interactive);
      if (deadTargets.length) {
        const c = clickOn(v.device, path, pick(deadTargets).selector, vw);
        if (c) events.push({ ...c, dead: true, ts: t + int(2000, 8000) });
      }
    }
    if (path === "/demo/about" && chance(0.32)) {
      const c = clickOn(v.device, path, "#roastery-video", vw);
      if (c) events.push({ ...c, ts: t + 5000 });
      events.push({ t: "event", n: "video_play", u: url(path), p: { src: "roastery.mp4", title: "Inside the roastery" }, ts: t + 5100 });
    }
    if (path === "/demo/brewing-guide") {
      if (chance(0.13)) {
        const c = clickOn(v.device, path, "#download-guide", vw);
        if (c) events.push({ ...c, ts: t + dwell - 3000 });
        events.push({ t: "event", n: "file_download", u: url(path), p: { file: "brew-guide.pdf" }, ts: t + dwell - 2900 });
      }
      if (chance(0.05)) {
        const c = clickOn(v.device, path, "#wiki-link", vw);
        if (c) events.push({ ...c, ts: t + dwell - 2000 });
        events.push({ t: "event", n: "outbound_click", u: url(path), p: { url: "https://en.wikipedia.org/wiki/Coffee_preparation", domain: "en.wikipedia.org" }, ts: t + dwell - 1900 });
      }
    }
    if (chance(0.022) && scroll > 70) {
      const c = clickOn(v.device, path, "#newsletter button", vw);
      if (c) events.push({ ...c, ts: t + dwell - 1500 });
      events.push({ t: "event", n: "form_submit", u: url(path), p: { form: "newsletter" }, ts: t + dwell - 1400 });
      events.push({ t: "event", n: "newsletter_signup", u: url(path), p: { tag: "#newsletter" }, ts: t + dwell - 1400 });
    }

    let next = nextPage(path, cart.length, buyBias);
    // Most one-page visits are quick bounces: a few seconds, little scrolling.
    if (next === null && pages === 1 && events.length === pageMark && chance(0.68)) {
      dwell = int(1500, 8500);
      scroll = Math.min(scroll, int(15, 45));
    }
    // The coupon field on the cart page is broken; some people hammer the Apply "button".
    if (path === "/demo/cart" && cart.length && chance(0.11)) {
      const base = t + int(3000, 9000);
      const n = int(3, 6);
      for (let i = 0; i < n; i++) {
        const c = clickOn(v.device, path, "#apply-coupon", vw);
        if (c) events.push({ ...c, rage: i === 2, dead: true, ts: base + i * 180 });
      }
      if (chance(0.35)) next = null; // and some give up
    }

    if (next === "ADD" && product) {
      const qty = pick([1, 2, 3], [70, 22, 8]);
      const c = clickOn(v.device, path, "#add-to-cart", vw);
      if (c) events.push({ ...c, ts: t + dwell - 800 });
      cart.push({ name: product.name, price: product.price, qty });
      events.push({ t: "event", n: "add_to_cart", u: url(path), p: { item: product.name, price: product.price, qty }, ts: t + dwell - 700 });
      next = "/demo/cart";
    } else if (next === "BUY") {
      const c = clickOn(v.device, path, "#pay", vw);
      if (c) events.push({ ...c, ts: t + dwell - 500 });
      const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
      const value = subtotal + (subtotal >= 40 ? 0 : 5);
      if (chance(0.08)) events.push({ t: "error", n: "js_error", u: url(path), p: { message: "TypeError: Cannot read properties of undefined (reading 'price')", source: "shop.js", line: 96 }, ts: t + dwell - 400 });
      events.push({ t: "event", n: "purchase", u: url(path), rev: value, p: { order_id: "NW-" + int(100000, 999999), items: cart.map((i) => i.name).join(", "), item: cart[0].name }, ts: t + dwell - 300 });
      cart = [];
      next = "/demo/thank-you";
    } else if (path === "/demo/checkout" && next === null && chance(0.05)) {
      events.push({ t: "error", n: "js_error", u: url(path), p: { message: "Failed to fetch shipping rates", kind: "promise" }, ts: t + 6000 });
    } else if (next && NAV_CLICK[path]) {
      const target = NAV_CLICK[path](next);
      if (target) {
        const c = clickOn(v.device, path, target[0], vw, target[1]);
        if (c) events.push({ ...c, ts: t + dwell - 600 });
      }
    }
    if (path === "/demo/checkout") events.push({ t: "event", n: "begin_checkout", u: url(path), p: { items: cart.length }, ts: t + 300 });
    if (path === "/demo/thank-you") events.push({ t: "event", n: "order_confirmation_view", u: url(path), p: { tag: "/demo/thank-you" }, ts: t + 400 });
    if (path === "/demo" && events.some((e) => e.sel === "#hero-shop" && (e.ts ?? 0) >= t)) events.push({ t: "event", n: "hero_cta_click", u: url(path), p: { tag: "#hero-shop" }, ts: t + dwell - 590 });

    events.push({ t: "page_leave", u: url(path), v: Math.round(dwell * (0.7 + rand() * 0.3)), p: { sd: scroll }, ts: t + dwell });
    t += dwell + int(300, 1500);
    path = next as string;
  }
  return events.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

// ---- main ---------------------------------------------------------------------------------------
async function setupSite() {
  if (process.env.SEED_RESET === "1" && (await getSite(SITE_ID))) await deleteSite(SITE_ID);
  const existing = await getSite(SITE_ID);
  if (existing) return existing;
  const site = await createSite({
    id: SITE_ID,
    name: "Northwind Coffee (demo)",
    domain: DOMAIN,
    timezone: TIMEZONE,
    public: true, // read-only for everyone, owned by nobody
    settings: { identity: "persistent", currency: "USD", consent: "none", respectDnt: false, replay: { enabled: true, sampleRate: 1, maskInputs: true } },
  });
  const goal = (name: string, kind: string, match: string, value: number) => ({
    sql: "INSERT INTO goals(site_id, name, kind, match, value) VALUES (?, ?, ?, ?, ?)",
    args: [SITE_ID, name, kind, match, value],
  });
  const funnel = (name: string, steps: object[]) => ({ sql: "INSERT INTO funnels(site_id, name, steps) VALUES (?, ?, ?)", args: [SITE_ID, name, JSON.stringify(steps)] });
  const tag = (kind: string, match: string, event: string) => ({
    sql: "INSERT INTO tags(site_id, kind, match, event, consent) VALUES (?, ?, ?, ?, 'analytics')",
    args: [SITE_ID, kind, match, event],
  });
  await batch([
    goal("Purchase", "event", "purchase", 0),
    goal("Newsletter signup", "event", "newsletter_signup", 3),
    goal("Reached checkout", "page", "/demo/checkout", 0),
    goal("Downloaded brewing guide", "event", "file_download", 1),
    funnel("Shop to purchase", [
      { label: "Viewed a product", kind: "page", match: "/demo/product/*" },
      { label: "Added to cart", kind: "event", match: "add_to_cart" },
      { label: "Started checkout", kind: "page", match: "/demo/checkout" },
      { label: "Purchased", kind: "event", match: "purchase" },
    ]),
    funnel("Content to customer", [
      { label: "Read the brewing guide", kind: "page", match: "/demo/brewing-guide" },
      { label: "Opened the shop", kind: "page", match: "/demo/shop" },
      { label: "Purchased", kind: "event", match: "purchase" },
    ]),
    tag("submit", "#newsletter", "newsletter_signup"),
    tag("click", "#hero-shop", "hero_cta_click"),
    tag("pageview", "/demo/thank-you", "order_confirmation_view"),
  ]);
  return site;
}

async function main() {
  const site = await setupSite();
  const existing = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE site_id = ?", [SITE_ID]))!.n;
  if (existing > 0 && process.env.SEED_RESET !== "1") {
    console.log(`demo site already has ${existing} sessions; run with SEED_RESET=1 to regenerate`);
    return;
  }

  const offset = 5.5 * 3_600_000; // Asia/Kolkata has no DST
  const now = Date.now();
  const todayLocal = Math.floor((now + offset) / DAY) * DAY - offset;
  const pool: Visitor[] = [];
  const HOURS = [1, 0.6, 0.4, 0.3, 0.3, 0.4, 0.8, 1.4, 2.2, 3, 3.4, 3.6, 3.5, 3.2, 3, 2.8, 2.7, 2.8, 3.1, 3.5, 3.6, 3.2, 2.4, 1.6];
  // Most traffic is from the US and Europe, so shift the curve a little later in IST.
  const WEEKDAY = [0.74, 1.05, 1.08, 1.06, 1.02, 0.95, 0.78]; // Sun..Sat
  let sessions = 0;
  let events = 0;
  const t0 = Date.now();

  for (let d = DAYS; d >= 0; d--) {
    const dayStart = todayLocal - d * DAY;
    const dow = new Date(dayStart + offset).getUTCDay();
    let volume = 380 * (1 + (DAYS - d) * 0.0045) * WEEKDAY[dow] * Math.exp(normal() * 0.07);
    const mix = CHANNELS.map((c) => c.weight);
    const mult = { buy: 1 };
    let note = "";
    if (d === 41) { volume *= 1.15; mix[5] *= 9; mult.buy = 1.25; note = "email campaign"; }
    if (d === 40) { volume *= 1.05; mix[5] *= 3; note = "email campaign tail"; }
    if (d === 18) { volume *= 0.33; note = "tracking outage"; }
    if (d === 9) { volume *= 1.25; mix[4] *= 8; note = "Product Hunt launch"; }
    const isToday = d === 0;
    const count = Math.round(volume);

    for (let i = 0; i < count; i++) {
      const hour = pick(Array.from({ length: 24 }, (_, h) => h), HOURS.map((w, h) => HOURS[(h + 20) % 24] * 0.3 + w * 0.7));
      const start = dayStart + hour * 3_600_000 + int(0, 3_599_000);
      if (isToday && start > now - 120_000) continue;
      const returning = pool.length > 50 && chance(0.27);
      let v: Visitor;
      if (returning) {
        // Recent and loyal visitors are more likely to come back.
        v = pool[Math.max(0, pool.length - 1 - Math.floor(Math.abs(normal()) * pool.length * 0.35))];
        if (rand() > 0.3 + v.loyal * 0.7) v = newVisitor(DAYS - d);
      } else v = newVisitor(DAYS - d);
      if (!returning || v.firstDay === DAYS - d) pool.push(v);
      const spec = pick(CHANNELS, mix);
      const evs = visit(v, start, spec, mult);
      if (isToday) {
        const cut = evs.findIndex((e) => (e.ts ?? 0) > now);
        if (cut === 0) continue;
        if (cut > 0) evs.length = cut;
      }
      const lang = v.lang;
      for (let k = 0; k < evs.length; k += 200) {
        await ingest(
          { s: SITE_ID, cid: v.cid, sw: v.screen[0], sh: v.screen[1], tz: null, lang, pf: "web", e: evs.slice(k, k + 200) },
          { ip: "seed", userAgent: v.ua, country: v.country, now, trustTimestamps: true },
        );
      }
      sessions++;
      events += evs.length;
    }
    if (note || d % 20 === 0) console.log(`${new Date(dayStart + offset).toISOString().slice(0, 10)}  ${count} sessions ${note ? "← " + note : ""}`);
  }
  // A few server-side (CRM / point-of-sale) orders to show cross-platform data.
  for (let i = 0; i < 60; i++) {
    const ts = now - int(1, DAYS) * DAY + int(0, DAY - 1);
    const value = pick([32, 48, 64, 96]);
    await ingest(
      { s: SITE_ID, uid: "pos-customer-" + int(1, 400), pf: "pos", e: [{ t: "event", n: "purchase", u: "/store/front-counter", rev: value, p: { item: pick(PRODUCTS).name, channel: "in-store" }, ts }] },
      { ip: "server", userAgent: "", country: "US", now, trustTimestamps: true },
    );
  }
  await run("ANALYZE");
  console.log(`seeded ${sessions.toLocaleString()} sessions and ${events.toLocaleString()} events for "${site.name}" in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
