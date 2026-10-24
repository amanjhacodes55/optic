// Records where the clickable elements of the demo shop sit, at desktop and mobile widths, so the
// seeder can place synthetic clicks on real elements and the heatmaps line up with the page.
// Usage: OPTIC_URL=http://localhost:3000 npm run demo:layout
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, launch } from "./lib/browser";

const ROUTES = ["/demo", "/demo/shop", "/demo/product/colombia-huila", "/demo/cart", "/demo/checkout", "/demo/thank-you", "/demo/brewing-guide", "/demo/about"];
const TARGETS = [
  "#hero-shop", ".hero .btn.secondary", ".card", ".top nav a", ".brand", "#add-to-cart", "#qty", "#grind", ".notes span",
  "#apply-coupon", "#coupon", "#checkout-btn", ".remove", "#pay", "#checkout-form input", "#download-guide", "#wiki-link",
  "#roastery-video", "#nl-email", "#newsletter button", ".hero .art", ".product .art", ".features div", ".article p", ".article h2",
];

type Box = { selector: string; x: number; y: number; w: number; h: number; interactive: boolean };

async function main() {
  const browser = await launch();
  const out: Record<string, Record<string, { height: number; width: number; boxes: Box[] }>> = { desktop: {}, mobile: {} };
  for (const [device, viewport] of [["desktop", { width: 1280, height: 800 }], ["mobile", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, isMobile: device === "mobile" });
    const page = await ctx.newPage();
    // Put one item in the cart so the cart and checkout pages render their full layout.
    await page.goto(BASE_URL + "/demo/product/colombia-huila");
    await page.click("#add-to-cart");
    await page.waitForURL("**/demo/cart");
    for (const route of ROUTES) {
      await page.evaluate((r) => { history.pushState({}, "", r); dispatchEvent(new PopStateEvent("popstate")); }, route);
      await page.waitForTimeout(250);
      const data = await page.evaluate((targets) => {
        const boxes: Box[] = [];
        const interactiveSel = "a,button,input,select,textarea,label,summary,[role=button],video";
        for (const sel of targets) {
          document.querySelectorAll(sel).forEach((el, i) => {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height || i > 8) return;
            boxes.push({ selector: sel, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, interactive: !!el.closest(interactiveSel) });
          });
        }
        return { boxes, height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth };
      }, TARGETS);
      out[device][route] = data;
    }
    await ctx.close();
  }
  await browser.close();
  const file = path.join(__dirname, "demo-layout.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log("wrote", file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
