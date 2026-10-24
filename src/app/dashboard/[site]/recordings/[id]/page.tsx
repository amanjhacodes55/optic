"use client";

import "rrweb-player/dist/style.css";
import { ArrowLeft, CircleAlert, Eye, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { dimLabel } from "@/components/dashboard/breakdown";
import { useApi, useDashboard } from "@/components/dashboard/state";
import { Card, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { duration } from "@/lib/format";

type Recording = {
  meta: { id: string; path: string; started_at: number; last_at: number; country: string; device: string; browser: string; os: string; channel: string; referrer_domain: string | null; clicks: number; rage_clicks: number; errors: number };
  events: { type: number; timestamp: number }[];
  timeline: { ts: number; type: string; name: string; path: string }[];
};

type Player = { goto: (ms: number, play?: boolean) => void; $destroy?: () => void };

export default function RecordingPage() {
  const { id } = useParams<{ id: string }>();
  const { siteId, href } = useDashboard();
  const { data, error } = useApi<Recording>(`/api/stats/recording?site=${siteId}&id=${id}`);
  const target = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);

  useEffect(() => {
    if (!data || !target.current || data.events.length < 2) return;
    let cancelled = false;
    import("rrweb-player").then(({ default: RRWebPlayer }) => {
      if (cancelled || !target.current) return;
      target.current.innerHTML = "";
      const width = Math.min(1100, target.current.clientWidth);
      player.current = new RRWebPlayer({
        target: target.current,
        props: { events: data.events as never, width, height: Math.round(width * 0.56), autoPlay: true, skipInactive: true, showController: true, mouseTail: { strokeStyle: "#3987e5" } },
      }) as unknown as Player;
    });
    return () => {
      cancelled = true;
      player.current?.$destroy?.();
    };
  }, [data]);

  const start = data?.events[0]?.timestamp ?? 0;
  return (
    <>
      <PageHeader
        title="Recording"
        description={data ? `${data.meta.path} · ${new Date(data.meta.started_at).toLocaleString()}` : undefined}
        actions={
          <Link href={href("/recordings")} className="btn">
            <ArrowLeft size={15} /> All recordings
          </Link>
        }
      />
      {error && <ErrorNote message={error} />}
      {!data ? (
        <Loading height={500} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <Card pad={false}>
            <div ref={target} className="flex min-h-[420px] justify-center overflow-hidden bg-surface-2 p-3">
              {data.events.length < 2 && <p className="self-center text-sm text-muted">This recording has no frames yet.</p>}
            </div>
          </Card>
          <div className="space-y-4">
            <Card title="Visitor">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-ink-2">Country</dt>
                <dd>{dimLabel("country", data.meta.country ?? "(none)")}</dd>
                <dt className="text-ink-2">Device</dt>
                <dd>
                  {data.meta.device} · {data.meta.os}
                </dd>
                <dt className="text-ink-2">Browser</dt>
                <dd>{data.meta.browser}</dd>
                <dt className="text-ink-2">Source</dt>
                <dd>
                  {data.meta.channel}
                  {data.meta.referrer_domain ? ` · ${data.meta.referrer_domain}` : ""}
                </dd>
                <dt className="text-ink-2">Length</dt>
                <dd>{duration((data.meta.last_at - data.meta.started_at) / 1000)}</dd>
              </dl>
            </Card>
            <Card title="Timeline" subtitle="Click to jump">
              <ul className="space-y-1 text-sm">
                {data.timeline.map((t, i) => (
                  <li key={i}>
                    <button className="flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-surface-2" onClick={() => player.current?.goto(Math.max(0, t.ts - start), true)}>
                      <span className="w-11 shrink-0 text-xs text-muted tabular">{duration(Math.max(0, (t.ts - start) / 1000))}</span>
                      {t.type === "pageview" ? <Eye size={14} className="mt-0.5 shrink-0 text-ink-2" /> : t.type === "error" ? <CircleAlert size={14} className="mt-0.5 shrink-0" style={{ color: "var(--critical)" }} /> : <Zap size={14} className="mt-0.5 shrink-0 text-accent-ink" />}
                      <span className="min-w-0 break-words">{t.type === "pageview" ? t.path : t.type === "error" ? "JavaScript error" : t.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
