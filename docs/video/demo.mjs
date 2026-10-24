// Records the Optic walkthrough: real clicks in the running app and the tracked demo shop, narrated
// by Kokoro, with small one-line captions burned in.
//
//   1. npm run build, then ./reset.sh (seeds a throwaway database in build/)
//   2. OPTIC_DB=$PWD/docs/video/build/optic.db npx next start -p 3012
//   3. OPTIC_URL=http://localhost:3012 BOTS=12 npm run demo:bots   (replays and heatmap clicks)
//   4. node docs/video/demo.mjs   (TTS_PYTHON / VOICE optional, see tts.py)
//
// Output: docs/media/optic-demo.mp4 (captions burned in); the .srt goes to build/.
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, launch, newContext, pointer, sleep, startRecording } from "./rec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(HERE, "build");
const MEDIA = path.join(HERE, "../media");
const LEAD = 0.35; // beat starts, then the voice comes in
const TAIL = 0.6; // breathing room after a line before the next beat
// Python with kokoro-onnx installed (see tts.py); VOICE picks the Kokoro voice.
const PYTHON = process.env.TTS_PYTHON || path.join(process.env.HOME, ".local/share/kokoro-tts/venv/bin/python");
const VOICE = process.env.VOICE || "af_heart";
fs.mkdirSync(path.join(BUILD, "voice"), { recursive: true });

function voice(text, caption = text) {
  const key = crypto.createHash("sha1").update(`${VOICE}\n${text}`).digest("hex").slice(0, 12);
  const file = path.join(BUILD, "voice", key + ".wav");
  if (!fs.existsSync(file)) execFileSync(PYTHON, [path.join(HERE, "tts.py"), file], { input: text, env: { ...process.env, VOICE }, stdio: ["pipe", "ignore", "inherit"] });
  return { file, seconds: probe(file), cues: cues(caption, file) };
}
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

// ---------------------------------------------------------------------------------------------
// Captions: one short line at a time. A line is split into phrases that fit, and each break is
// snapped to the pause the voice actually takes there, so the text changes when the speaker breathes.

const MAX_CHARS = 44;

function phrases(text) {
  // Break after punctuation first, then pack words so no caption runs past MAX_CHARS.
  const parts = text.match(/[^,.:;!?]+[,.:;!?]*\s*/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const last = out.at(-1);
    if (last && !/[.:;!?]$/.test(last) && last.length + 1 + p.length <= MAX_CHARS) out[out.length - 1] = `${last} ${p}`;
    else if (p.length <= MAX_CHARS) out.push(p);
    else out.push(...split(p));
  }
  return out;
}

// Halve an over-long phrase where a reader would pause: before a joining word, never after an article.
const JOIN = new Set(["and", "or", "but", "so", "with", "to", "that", "for", "in", "on", "right", "all", "then"]);
const STICKY = new Set(["a", "an", "the", "to", "of", "your", "its", "their"]);
function split(p) {
  if (p.length <= MAX_CHARS) return [p];
  const w = p.split(" ");
  let best = 1, score = Infinity;
  for (let i = 1; i < w.length; i++) {
    const left = w.slice(0, i).join(" "), right = w.slice(i).join(" ");
    let sc = Math.abs(left.length - right.length) + 20 * (Math.max(left.length, right.length) > MAX_CHARS);
    if (JOIN.has(w[i].toLowerCase())) sc -= 12;
    if (STICKY.has(w[i - 1].toLowerCase())) sc += 40;
    if (sc < score) { score = sc; best = i; }
  }
  return [...split(w.slice(0, best).join(" ")), ...split(w.slice(best).join(" "))];
}

function pauses(file) {
  const log = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=n=-38dB:d=0.12", "-f", "null", "-"]).stderr.toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((s, i) => ({ s, e: ends[i] ?? s })).filter((p) => p.e > p.s);
}

function cues(text, file) {
  const lines = phrases(text);
  const total = probe(file);
  const gaps = pauses(file);
  const chars = lines.reduce((n, l) => n + l.length, 0);
  let acc = 0, start = 0;
  return lines.map((line, i) => {
    acc += line.length;
    let end = i === lines.length - 1 ? total : (acc / chars) * total;
    if (i < lines.length - 1) {
      const near = gaps.filter((g) => Math.abs((g.s + g.e) / 2 - end) < 0.7).sort((a, b) => Math.abs((a.s + a.e) / 2 - end) - Math.abs((b.s + b.e) / 2 - end))[0];
      if (near) end = near.s + 0.05;
    }
    const cue = { line, start, end };
    start = end;
    return cue;
  });
}

// ---------------------------------------------------------------------------------------------
// Setup (not recorded): the landing page, the public demo dashboard, and a visitor on the demo shop.

const browser = await launch();
const landing = await (await newContext(browser)).newPage();
await landing.goto(`${BASE}/`);
await landing.waitForLoadState("networkidle");

const app = await (await newContext(browser)).newPage();
// Opens on Realtime, so the shop visit pops into the live feed on its own 5-second refresh.
await app.goto(`${BASE}/dashboard/demo/realtime`);
await app.waitForLoadState("networkidle");

// A shopper from New York who found the shop on Google: shows up live in Realtime a beat later.
// A real browser user agent: Optic drops HeadlessChrome as a bot.
const shopCtx = await newContext(browser, { timezoneId: "America/New_York", locale: "en-US", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
const shop = await shopCtx.newPage();
await shop.goto(`${BASE}/demo`, { referer: "https://www.google.com/" });
await shop.waitForLoadState("networkidle");

const card = await (await newContext(browser)).newPage();
await card.setContent(fs.readFileSync(path.join(HERE, "outro.html"), "utf8"), { waitUntil: "networkidle" });

const A = pointer(app), S = pointer(shop), L = pointer(landing);
const nav = async (label, url) => {
  await A.click(app.locator("aside nav a", { hasText: label }).first());
  await app.waitForURL(url);
  await app.waitForLoadState("networkidle");
};
const cardTitled = (title) => app.locator("section.card", { has: app.locator("h2", { hasText: title }) }).first();
/** Eased scroll that brings a locator near the top of the window. */
async function reveal(P, page, loc, top = 140, ms = 1300) {
  const b = await loc.boundingBox();
  if (b) await P.scroll(b.y - top, ms);
}

// ---------------------------------------------------------------------------------------------
// Beats: one or two sentences each, with the actions that happen while they're spoken.

const beats = [
  { page: landing, text: "This is Optic: open-source web analytics you host yourself, with heatmaps and session replays built in.", run: async () => {
    await sleep(800);
    await L.hover(landing.getByRole("heading", { level: 1 }), { dx: 0.75, dy: 0.7, ms: 1400 });
    await sleep(900);
    await L.hover(landing.locator("pre").first(), { dx: 0.4, ms: 1200 });
  } },
  { page: landing, text: "Reports like Google Analytics, heatmaps and recordings like Microsoft Clarity, and forecasts on top. No cookie banner, and no third parties.", run: async () => {
    await L.scroll(760, 2600);
    await sleep(1600);
    await L.moveTo(900, 520, 1200);
    await L.scroll(700, 2400);
  } },
  { page: shop, text: "Add one script tag to your site. Here's a demo coffee shop with Optic installed. Let's browse it and add a bag to the cart.", run: async () => {
    await sleep(500);
    await S.hover(shop.locator("h1").first(), { dx: 0.6, ms: 1000 });
    await S.click(shop.locator("#hero-shop"));
    await shop.waitForURL(/\/demo\/shop/);
    await sleep(900);
    await S.click(shop.locator(".card").nth(1));
    await sleep(1200);
    await S.click(shop.locator("#add-to-cart"));
    await shop.waitForURL(/\/demo\/cart/);
    await sleep(600);
  } },
  { page: app, text: "That visit shows up in Realtime within seconds: the page views, the add to cart, and where the visitor came from.", run: async () => {
    await sleep(1200);
    await A.hover(cardTitled("Live feed"), { dx: 0.4, dy: 0.3, ms: 1000 });
    await sleep(900);
    await A.hover(cardTitled("Sources now"), { dx: 0.4, dy: 0.4, ms: 900 });
  } },
  { page: app, text: "The overview shows visitors, sessions, bounce rate, conversions, and revenue, each compared with the period before.", run: async () => {
    await nav("Overview", /\/dashboard\/demo$/);
    await sleep(500);
    for (const k of ["Visitors", "Bounce rate", "Conversions", "Revenue"]) {
      await A.hover(app.getByText(k, { exact: true }).first(), { dy: 1.2, ms: 600 });
      await sleep(200);
    }
  } },
  { page: app, text: "Click any row to filter the whole dashboard. Here, only email traffic.", run: async () => {
    await reveal(A, app, cardTitled("Traffic sources"), 160, 1200);
    await sleep(300);
    await A.click(cardTitled("Traffic sources").getByText("Email", { exact: true }).first());
    await sleep(700);
    await app.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
    await sleep(900);
    await A.hover(app.getByText("Channel", { exact: false }).filter({ hasText: "Email" }).first(), { ms: 900 });
  } },
  { page: app, text: "Funnels show where people drop off between viewing a product and paying, with the time each step takes, and a split by device or channel.", run: async () => {
    await A.click(app.getByRole("button", { name: /Remove filter/ }).first());
    await nav("Funnels", /\/funnels/);
    await sleep(500);
    for (const step of ["1. Viewed a product", "2. Added to cart", "3. Started checkout", "4. Purchased"]) {
      await A.hover(app.getByText(step).first(), { ms: 700 });
      await sleep(400);
    }
  } },
  { page: app, text: "Paths show where people go before and after any page, and retention tracks weekly cohorts of returning visitors.", run: async () => {
    await nav("Paths", /\/paths/);
    await sleep(900);
    await A.hover(cardTitled("Flow"), { dx: 0.5, dy: 0.35, ms: 1000 });
    await sleep(700);
    await nav("Retention", /\/retention/);
    await sleep(700);
    await A.hover(cardTitled("Average retention curve"), { dx: 0.5, dy: 0.5, ms: 1000 });
  } },
  { page: app, text: "E-commerce tracks revenue, orders, and average order value, plus your best-selling products and revenue by channel.", run: async () => {
    await nav("E-commerce", /\/ecommerce/);
    await sleep(400);
    for (const k of ["Revenue", "Orders", "Average order value"]) {
      await A.hover(app.getByText(k, { exact: true }).first(), { dy: 1.4, ms: 600 });
      await sleep(200);
    }
    await reveal(A, app, cardTitled("Products"), 160, 1300);
    await A.hover(cardTitled("Products").locator("tbody tr").first(), { dx: 0.3, ms: 800 });
    await sleep(300);
    await A.hover(cardTitled("Products").locator("tbody tr").nth(3), { dx: 0.3, ms: 600 });
    await sleep(300);
    await A.hover(cardTitled("Revenue by channel"), { dx: 0.5, dy: 0.5, ms: 800 });
  } },
  { page: app, text: "Heatmaps are drawn over the live page. On the cart, people rage-click a broken coupon button, and Optic flags it.", run: async () => {
    await nav("Heatmaps", /\/heatmaps/);
    await sleep(500);
    const select = app.getByRole("combobox", { name: "Page" });
    await A.hover(select, { dx: 0.4, ms: 800 });
    await select.selectOption("/demo/cart");
    await app.waitForLoadState("networkidle");
    await sleep(1000);
    await A.hover(app.locator("iframe").first(), { dx: 0.62, dy: 0.45, ms: 1000 });
    await sleep(400);
    await A.hover(cardTitled("Most clicked elements"), { dx: 0.4, dy: 0.35, ms: 900 });
  } },
  { page: app, text: "Every visit can be replayed, with typed text masked. The timeline lists each page and event, so you can jump straight to the moment that matters.", run: async () => {
    await nav("Recordings", /\/recordings/);
    await sleep(600);
    const row = app.locator("tr", { hasText: "rage" }).first();
    await A.hover(row, { dx: 0.3, ms: 900 });
    await A.click(row, { dx: 0.3 });
    await app.waitForURL(/\/recordings\/\w+/);
    await sleep(1000);
    await A.click(app.getByRole("button", { name: /add_to_cart/ }).first());
    await sleep(1300);
    await A.click(app.getByRole("button", { name: /begin_checkout/ }).first());
    await sleep(800);
  } },
  { page: app, text: "Insights flags unusual days against a weekday baseline, forecasts the next two weeks, and shows which channels drove the change.", run: async () => {
    await nav("Insights", /\/insights/);
    await sleep(900);
    await A.hover(app.locator("svg circle[fill]").first(), { ms: 1000 }).catch(() => A.moveTo(1450, 520, 1000));
    await sleep(500);
    await A.moveTo(1650, 480, 1000);
    await sleep(400);
    await A.hover(cardTitled("What changed"), { dx: 0.5, dy: 0.6, ms: 1000 });
  } },
  { page: app, text: "Explore builds custom reports from up to three dimensions and eight metrics, and exports them to CSV for your spreadsheets.", run: async () => {
    await nav("Explore", /\/explore/);
    await sleep(700);
    await A.click(app.getByRole("button", { name: "Country", exact: true }).first());
    await sleep(700);
    await A.click(app.getByRole("button", { name: "Visitors", exact: true }).first());
    await sleep(900);
    await A.moveTo(1100, 760, 1000);
  } },
  { page: app, text: "The no-code tag manager turns clicks and form submits into events, without touching your site. And of course, there's a dark mode.", run: async () => {
    await nav("Settings", /\/settings/);
    await sleep(600);
    await reveal(A, app, cardTitled("Tag manager"), 150, 1300);
    await A.hover(cardTitled("Tag manager"), { dx: 0.35, dy: 0.4, ms: 900 });
    await sleep(200);
    await A.click(app.getByRole("button", { name: "Toggle theme" }), { ms: 800 });
  } },
  { page: card, text: "Optic is free and open source. Run it with Docker on your own server, or deploy it to Netlify. Grab it on GitHub, and own your analytics.", run: async () => {
    await card.evaluate(() => document.body.classList.add("in"));
  } },
];

// ---------------------------------------------------------------------------------------------
// Record every beat, then lay the voice and captions over the joined clips.

const only = process.env.ONLY ? Number(process.env.ONLY) : null;
const clips = [];
for (const [i, b] of beats.entries()) {
  if (only !== null && i > only) break;
  const vo = voice(b.say ?? b.text, b.text);
  const want = LEAD + vo.seconds + TAIL;
  await b.page.bringToFront();
  const rec = await startRecording(b.page);
  const started = Date.now();
  await b.run();
  const left = want - (Date.now() - started) / 1000;
  if (left > 0) await sleep(left * 1000);
  const out = path.join(BUILD, `beat${String(i).padStart(2, "0")}.mp4`);
  await rec.stop(out);
  clips.push({ out, vo, text: b.text, seconds: probe(out) });
  console.log(`beat ${i}: ${clips.at(-1).seconds.toFixed(1)}s (voice ${vo.seconds.toFixed(1)}s)`);
}
await browser.close();

const list = path.join(BUILD, "clips.txt");
fs.writeFileSync(list, clips.map((c) => `file '${c.out}'`).join("\n"));
const total = clips.reduce((s, c) => s + c.seconds, 0);
const args = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list];
const graph = [];
let t = 0, srt = "", n = 0;
const ass = [
  "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "WrapStyle: 2", "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  // Small white text on a soft dark box, sitting low and centred.
  "Style: Cap,Noto Sans,34,&H00FFFFFF,&H00FFFFFF,&H5A16131F,&H00000000,0,0,0,0,100,100,0.3,0,3,9,0,2,40,40,46,1",
  "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
];
const stamp = (s) => new Date(s * 1000).toISOString().slice(11, 23).replace(".", ",");
const assStamp = (s) => { const d = new Date(s * 1000).toISOString(); return `${Number(d.slice(11, 13))}${d.slice(13, 22)}`; };
clips.forEach((c, i) => {
  args.push("-i", c.vo.file);
  graph.push(`[${i + 1}:a]aresample=48000,adelay=${Math.round((t + LEAD) * 1000)}:all=1[a${i}]`);
  for (const q of c.vo.cues) {
    // Only the last line of a beat lingers; inside a beat, one line hands straight to the next.
    const a = t + LEAD + q.start, b = t + LEAD + q.end + (q === c.vo.cues.at(-1) ? 0.25 : -0.02);
    srt += `${++n}\n${stamp(a)} --> ${stamp(b)}\n${q.line}\n\n`;
    ass.push(`Dialogue: 0,${assStamp(a)},${assStamp(b)},Cap,,0,0,0,,{\\fad(120,120)}${q.line}`);
  }
  t += c.seconds;
});
const assFile = path.join(BUILD, "captions.ass");
fs.writeFileSync(assFile, ass.join("\n") + "\n");

// Voice only, no music bed: a little warmth and gentle compression.
graph.push(`${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,`
  + `highpass=f=70,equalizer=f=180:t=q:w=1:g=1.5,equalizer=f=6500:t=q:w=1.5:g=-2,`
  + `acompressor=threshold=-20dB:ratio=2.5:attack=8:release=180,aformat=channel_layouts=stereo,`
  + `loudnorm=I=-16:TP=-1.5,aresample=48000,apad,atrim=0:${total.toFixed(3)}[a]`);
graph.push(`[0:v]ass='${assFile.replace(/'/g, "\\'")}',fade=t=in:d=0.5,fade=t=out:st=${(total - 0.9).toFixed(3)}:d=0.9[v]`);
const out = path.join(only !== null ? BUILD : MEDIA, "optic-demo.mp4");
execFileSync("ffmpeg", [...args, "-filter_complex", graph.join(";"), "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
// Kept out of docs/media: players auto-load a same-named .srt on top of the burned-in captions.
fs.writeFileSync(path.join(BUILD, "optic-demo.srt"), srt);
console.log(`done: ${out} (${total.toFixed(1)}s)`);
