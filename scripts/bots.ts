// Drives real browsers through the demo shop so the tracker records genuine sessions:
// session replays, heatmap clicks, rage clicks on the broken coupon button, purchases.
//
//   OPTIC_URL=http://localhost:3000 npm run demo:bots            # 6 visits
//   BOTS=20 npm run demo:bots                                     # more visits
//   BOTS_LOOP=1 npm run demo:bots                                 # keep going (live realtime demo)
import type { Browser, Page } from "playwright-core";
import { BASE_URL, launch } from "./lib/browser";

const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

type Persona = { name: string; ua: string; viewport: { width: number; height: number }; mobile: boolean; entry: string; referer?: string; run: (p: Page) => Promise<void> };

const pause = (p: Page, min = 600, max = 1800) => p.waitForTimeout(min + Math.random() * (max - min));

async function slowScroll(p: Page, to = 0.8) {
  const h = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; y < h * to; y += 120) {
    await p.mouse.wheel(0, 120);
    await p.waitForTimeout(90);
  }
}

async function hoverClick(p: Page, selector: string) {
  const el = p.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (box) {
    await p.mouse.move(box.x + box.width / 2 + (Math.random() - 0.5) * 10, box.y + box.height / 2, { steps: 12 });
    await pause(p, 200, 500);
  }
  await el.click();
}

async function buyer(p: Page) {
  await pause(p);
  await slowScroll(p, 0.5);
  await hoverClick(p, "#hero-shop");
  await pause(p);
  await hoverClick(p, ".card >> nth=1");
  await pause(p, 1200, 2500);
  await p.selectOption("#qty", "2");
  await hoverClick(p, "#add-to-cart");
  await p.waitForURL("**/demo/cart");
  await pause(p);
  await p.fill("#coupon", "WELCOME10");
  for (let i = 0; i < 4; i++) {
    await p.click("#apply-coupon");
    await p.waitForTimeout(150);
  }
  await pause(p, 1200, 2000);
  await hoverClick(p, "#checkout-btn");
  await pause(p);
  const inputs = p.locator("#checkout-form input");
  const values = ["sam@example.com", "Sam", "Rivera", "12 Harbour Rd", "Portland", "97201", "4242 4242 4242 4242"];
  for (let i = 0; i < values.length; i++) await inputs.nth(i).pressSequentially(values[i], { delay: 35 });
  await pause(p);
  await hoverClick(p, "#pay");
  await p.waitForURL("**/thank-you");
  await pause(p, 1500, 2500);
}

async function reader(p: Page) {
  await pause(p);
  await slowScroll(p, 0.9);
  await pause(p, 1500, 3000);
  await hoverClick(p, "#download-guide").catch(() => {});
  await pause(p);
  await hoverClick(p, ".top nav a >> nth=0");
  await pause(p);
  await hoverClick(p, ".card >> nth=4");
  await pause(p, 1500, 2500);
}

async function browser(p: Page) {
  await pause(p);
  await hoverClick(p, ".card >> nth=0");
  await pause(p);
  // Clicks on the product image do nothing: a dead click.
  await hoverClick(p, ".product .art");
  await pause(p);
  await p.goBack();
  await pause(p);
  await hoverClick(p, ".card >> nth=3");
  await hoverClick(p, "#add-to-cart");
  await p.waitForURL("**/demo/cart");
  await pause(p, 1000, 2000);
}

async function bouncer(p: Page) {
  await pause(p, 1500, 3000);
  await slowScroll(p, 0.3);
}

async function watcher(p: Page) {
  await pause(p);
  await hoverClick(p, ".top nav a >> nth=2");
  await pause(p);
  await hoverClick(p, "#roastery-video");
  await pause(p, 2500, 4000);
  await slowScroll(p, 1);
  await p.fill("#nl-email", "fan@example.com");
  await hoverClick(p, "#newsletter button");
  await pause(p);
}

const PERSONAS: Persona[] = [
  { name: "buyer (email)", ua: DESKTOP_UA, viewport: { width: 1280, height: 800 }, mobile: false, entry: "/demo?utm_source=newsletter&utm_medium=email&utm_campaign=monthly-roast", run: buyer },
  { name: "reader (search)", ua: MAC_UA, viewport: { width: 1280, height: 800 }, mobile: false, entry: "/demo/brewing-guide", referer: "https://www.google.com/", run: reader },
  { name: "browser (mobile, social)", ua: PHONE_UA, viewport: { width: 390, height: 844 }, mobile: true, entry: "/demo/shop", referer: "https://www.reddit.com/r/Coffee/", run: browser },
  { name: "bouncer (mobile)", ua: PHONE_UA, viewport: { width: 390, height: 844 }, mobile: true, entry: "/demo", referer: "https://t.co/", run: bouncer },
  { name: "video watcher", ua: DESKTOP_UA, viewport: { width: 1280, height: 800 }, mobile: false, entry: "/demo", referer: "https://www.producthunt.com/", run: watcher },
  { name: "buyer (paid search)", ua: MAC_UA, viewport: { width: 1280, height: 800 }, mobile: false, entry: "/demo?utm_source=google&utm_medium=cpc&utm_campaign=coffee-beans", run: buyer },
];

async function visit(b: Browser, persona: Persona) {
  const ctx = await b.newContext({ userAgent: persona.ua, viewport: persona.viewport, isMobile: persona.mobile, hasTouch: persona.mobile });
  const p = await ctx.newPage();
  try {
    await p.goto(BASE_URL + persona.entry, { waitUntil: "networkidle", referer: persona.referer });
    await persona.run(p);
    await p.waitForTimeout(6000); // let the tracker flush its last batch and replay chunk
  } catch (e) {
    console.warn(`  ${persona.name}: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const total = Number(process.env.BOTS ?? PERSONAS.length);
  const loop = process.env.BOTS_LOOP === "1";
  const parallel = Number(process.env.BOTS_PARALLEL ?? 3);
  const b = await launch();
  let n = 0;
  do {
    const batch = Array.from({ length: loop ? parallel : total }, (_, i) => PERSONAS[(n + i) % PERSONAS.length]);
    for (let i = 0; i < batch.length; i += parallel) {
      await Promise.all(
        batch.slice(i, i + parallel).map(async (persona) => {
          console.log(`visit ${++n}: ${persona.name}`);
          await visit(b, persona);
        }),
      );
    }
  } while (loop);
  await b.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
