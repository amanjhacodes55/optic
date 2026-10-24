"use client";

import { MousePointerClick, Monitor, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWidth } from "@/components/charts";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, Empty, Loading, PageHeader, Tabs } from "@/components/ui";
import { num, pct } from "@/lib/format";

type Heatmap = {
  path: string;
  device: "desktop" | "mobile";
  clicks: { x: number; y: number; rage: number; dead: number }[];
  selectors: { selector: string; clicks: number; rage: number; dead: number }[];
  scroll: { depth: number; reached: number }[];
  pages: { path: string; clicks: number }[];
  domain: string;
};

const FRAME_WIDTH = { desktop: 1280, mobile: 390 };

// Sequential warm ramp (light yellow to deep red) for click density: one direction, no rainbow.
const STOPS: [number, [number, number, number]][] = [
  [0, [255, 237, 160]],
  [0.35, [254, 178, 76]],
  [0.65, [240, 59, 32]],
  [1, [128, 0, 38]],
];
function rampColor(t: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * k)) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Share of visitors who scrolled at least `depth`% down, interpolated between the deciles. */
function reachedAt(scroll: Heatmap["scroll"], depth: number): number {
  const lo = scroll[Math.min(scroll.length - 1, Math.floor(depth / 10))];
  const hi = scroll[Math.min(scroll.length - 1, Math.ceil(depth / 10))];
  if (!lo || !hi || lo === hi) return lo?.reached ?? 0;
  return lo.reached + ((hi.reached - lo.reached) * (depth - lo.depth)) / (hi.depth - lo.depth);
}

export default function HeatmapsPage() {
  const { qs, site, siteId } = useDashboard();
  const [path, setPath] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [mode, setMode] = useState<"clicks" | "scroll">("clicks");
  const { data, loading } = useApi<Heatmap>(`/api/stats/heatmap?${qs({ path: path ?? undefined, device })}`);
  const current = path ?? data?.pages[0]?.path ?? null;
  const { data: forPage } = useApi<Heatmap>(current && !path ? `/api/stats/heatmap?${qs({ path: current, device })}` : null);
  const view = path ? data : (forPage ?? null);

  // The demo shop is served by Optic itself; other sites load from their own domain.
  const origin = typeof window !== "undefined" && (siteId === "demo" || site?.domain === window.location.host) ? window.location.origin : `https://${site?.domain ?? ""}`;

  return (
    <>
      <PageHeader
        title="Heatmaps"
        description="Where people click and how far they scroll, drawn over the live page. Rage clicks (3+ fast clicks in one spot) and dead clicks (no response) are flagged."
        actions={
          <>
            <select className="input max-w-xs" value={current ?? ""} onChange={(e) => setPath(e.target.value)} aria-label="Page">
              {(data?.pages ?? []).map((p) => (
                <option key={p.path} value={p.path}>
                  {p.path} ({num(p.clicks)})
                </option>
              ))}
            </select>
            <Tabs value={device} onChange={setDevice} options={[{ value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }]} size="md" />
            <Tabs value={mode} onChange={setMode} options={[{ value: "clicks", label: "Clicks" }, { value: "scroll", label: "Scroll" }]} size="md" />
          </>
        }
      />
      {loading && !data ? (
        <Loading height={500} />
      ) : !current ? (
        <Card>
          <Empty title="No clicks recorded yet">Heatmaps fill in as soon as the tracker is installed and people start clicking.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card pad={false} title={<span className="flex items-center gap-2">{device === "desktop" ? <Monitor size={15} /> : <Smartphone size={15} />} {current}</span>} subtitle={view ? `${num(view.clicks.length)} clicks` : undefined}>
            {view ? <Overlay origin={origin} data={view} mode={mode} /> : <Loading height={500} />}
          </Card>
          <div className="space-y-4">
            <Card title="Most clicked elements">
              {view && view.selectors.length ? (
                <ul className="space-y-2 text-sm">
                  {view.selectors.map((s) => (
                    <li key={s.selector} className="flex items-start justify-between gap-2">
                      <code className="min-w-0 break-all text-xs">{s.selector}</code>
                      <span className="shrink-0 text-right tabular">
                        <span className="font-medium">{num(s.clicks)}</span>
                        {s.rage > 0 && <div className="text-xs" style={{ color: "var(--critical)" }}>⚠ {num(s.rage)} rage</div>}
                        {s.dead > 0 && <div className="text-xs text-ink-2">{num(s.dead)} dead</div>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">–</p>
              )}
            </Card>
            {view && (
              <Card title="Scroll reach">
                <ul className="space-y-1.5 text-sm">
                  {[25, 50, 75, 100].map((depth) => {
                    const reached = reachedAt(view.scroll, depth);
                    return (
                      <li key={depth} className="flex items-center gap-2">
                        <span className="w-12 text-xs text-ink-2">{depth}%</span>
                        <div className="h-2.5 flex-1 rounded bg-surface-2">
                          <div className="h-2.5 rounded" style={{ width: `${reached * 100}%`, background: "var(--s1)" }} />
                        </div>
                        <span className="w-12 text-right text-xs font-medium tabular">{pct(reached, 0)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Overlay({ origin, data, mode }: { origin: string; data: Heatmap; mode: "clicks" | "scroll" }) {
  const frameW = FRAME_WIDTH[data.device];
  const [box, width] = useWidth<HTMLDivElement>();
  const [docH, setDocH] = useState(Math.max(1200, ...data.clicks.map((c) => c.y + 200)));
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = width ? Math.min(1, width / frameW) : 1;
  const src = `${origin}${data.path}${data.path.includes("?") ? "&" : "?"}optic_preview=1`;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    c.width = frameW;
    c.height = docH;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, frameW, docH);
    if (mode === "scroll") {
      // Darker where fewer visitors scrolled; a labelled line at each quarter.
      for (let y = 0; y < docH; y += 4) {
        const depth = (y / docH) * 100;
        ctx.fillStyle = `rgba(13, 54, 107, ${(1 - reachedAt(data.scroll, depth)) * 0.7})`;
        ctx.fillRect(0, y, frameW, 4);
      }
      ctx.font = "600 13px system-ui, sans-serif";
      for (const q of [25, 50, 75]) {
        const y = (q / 100) * docH;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillRect(0, y - 1, frameW, 2);
        const label = `${pct(reachedAt(data.scroll, q), 0)} of visitors reached this point`;
        const w = ctx.measureText(label).width + 16;
        ctx.fillStyle = "#0b0b0b";
        ctx.fillRect(12, y - 26, w, 22);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, 20, y - 10);
      }
      return;
    }
    // Density: accumulate soft points on an alpha-only buffer, then colour by intensity.
    const buf = document.createElement("canvas");
    buf.width = frameW;
    buf.height = docH;
    const b = buf.getContext("2d")!;
    const r = data.device === "mobile" ? 18 : 24;
    for (const p of data.clicks) {
      const x = p.x * frameW;
      const g = b.createRadialGradient(x, p.y, 0, x, p.y, r);
      g.addColorStop(0, "rgba(0,0,0,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      b.fillStyle = g;
      b.fillRect(x - r, p.y - r, r * 2, r * 2);
    }
    const img = b.getImageData(0, 0, frameW, docH);
    let max = 1;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > max) max = img.data[i];
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3];
      if (!a) continue;
      const t = Math.min(1, a / max);
      const [cr, cg, cb] = rampColor(t);
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = Math.round(70 + t * 170);
    }
    ctx.putImageData(img, 0, 0);
    // Rage clicks get a ring so they stand out from ordinary density.
    ctx.strokeStyle = "#d03b3b";
    ctx.lineWidth = 2;
    for (const p of data.clicks) {
      if (!p.rage) continue;
      ctx.beginPath();
      ctx.arc(p.x * frameW, p.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [data, docH, frameW, mode]);

  return (
    <div ref={box} className="relative overflow-hidden bg-surface-2" style={{ height: docH * scale }}>
      <div style={{ width: frameW, height: docH, transform: `scale(${scale})`, transformOrigin: "top left", margin: scale < 1 ? 0 : "0 auto" }} className="relative">
        <iframe
          key={src}
          src={src}
          title="Page preview"
          width={frameW}
          height={docH}
          className="pointer-events-none absolute inset-0 border-0 bg-white"
          sandbox="allow-scripts allow-same-origin"
          onLoad={(e) => {
            try {
              const h = (e.target as HTMLIFrameElement).contentDocument?.documentElement.scrollHeight;
              if (h && h > 200) setDocH(h);
            } catch {
              /* cross-origin: keep the estimate from click positions */
            }
          }}
        />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0" style={{ width: frameW, height: docH }} />
      </div>
      <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-surface/90 px-3 py-1.5 text-xs shadow">
        {mode === "clicks" ? (
          <>
            <MousePointerClick size={13} /> Fewer
            <span className="inline-block h-2 w-20 rounded" style={{ background: "linear-gradient(90deg, rgb(255,237,160), rgb(254,178,76), rgb(240,59,32), rgb(128,0,38))" }} />
            More · <span style={{ color: "var(--critical)" }}>◯ rage click</span>
          </>
        ) : (
          <>Darker = fewer visitors scrolled this far</>
        )}
      </div>
    </div>
  );
}
