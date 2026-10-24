"use client";

import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { send, useApi, useDashboard } from "@/components/dashboard/state";
import { Card, ErrorNote, PageHeader } from "@/components/ui";
import type { ClientSite } from "@/components/dashboard/state";
import type { SiteSettings } from "@/lib/sites";

type Site = ClientSite;

const noop = () => () => {};

type Tag = { id: number; kind: "click" | "submit" | "pageview" | "script"; match: string; event: string | null; consent: string; enabled: number };

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 pr-12 text-xs leading-relaxed">{code}</pre>
      <button
        className="btn absolute right-2 top-2 h-7 px-2"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { site: loaded, siteId } = useDashboard();
  const welcome = useSearchParams().get("welcome") === "1";
  // Saves return the updated site; prefer that copy until the dashboard reloads the site itself.
  const [saved, setSite] = useState<Site | null>(null);
  const site = saved && saved.id === loaded?.id ? saved : loaded;
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "https://your-optic-host",
  );
  if (!site) return null;

  const snippet = `<script defer src="${origin}/optic.js" data-site="${site.id}"></script>`;
  const save = async (patch: Omit<Partial<Site>, "settings"> & { settings?: Partial<SiteSettings>; rotateKey?: boolean }) =>
    setSite((await send(`/api/sites/${siteId}`, "PATCH", patch)) as Site);

  return (
    <>
      <PageHeader title="Settings" description={`${site.name} · ${site.domain}`} />
      {welcome && (
        <div className="mb-4 rounded-xl border border-accent bg-accent-wash px-4 py-3 text-sm">
          <b>Site created.</b> Add the snippet below to every page (inside <code>&lt;head&gt;</code>), then open the site: visits show up in Realtime within
          seconds.
        </div>
      )}
      {!site.can_edit && (
        <div className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
          These are the demo site&apos;s settings, shown read-only. Settings for your own sites can be changed here.
        </div>
      )}
      <fieldset disabled={!site.can_edit} className="min-w-0 space-y-4">
        <Card title="Tracking code" subtitle="One script, about 6 KB gzipped. No cookies by default.">
          <CodeBlock code={snippet} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">JavaScript API: custom events, purchases, identity, consent</summary>
            <div className="mt-2">
              <CodeBlock
                code={`<!-- Optional: queue calls made before the script loads -->
<script>window.optic=window.optic||function(){(optic.q=optic.q||[]).push(arguments)}</script>

optic("event", "signup", { plan: "pro" });            // custom event with properties
optic("purchase", 49.99, { order_id: "A-1009" });   // revenue for e-commerce reports
optic("identify", "user-123");                       // cross-device: tie sessions to your user id
optic("consent", true);                              // after the visitor accepts your banner
optic("pageview");                                   // manual pageview (with data-auto-pageview="false")

<!-- No-code: any element can send an event when clicked -->
<button data-optic-event="cta_click" data-optic-prop-location="hero">Start</button>`}
              />
            </div>
          </details>
        </Card>

        <Card title="General">
          <GeneralForm site={site} onSave={save} />
        </Card>

        <Card title="Privacy and data collection" subtitle="Defaults are the most private option that still gives useful reports.">
          <div className="divide-y divide-line">
            <Setting
              title="Visitor identity"
              help="Cookieless hashes IP + user agent with a salt that rotates daily: no storage on the device, nothing to consent to in most places, but no retention reports. Persistent stores a random id in localStorage."
            >
              <select
                className="input"
                value={site.settings.identity}
                onChange={(e) => save({ settings: { identity: e.target.value as SiteSettings["identity"] } })}
              >
                <option value="cookieless">Cookieless (daily rotating)</option>
                <option value="persistent">Persistent first-party id</option>
              </select>
            </Setting>
            <Setting
              title="Consent"
              help="Require an explicit optic('consent', true) before anything is sent. 'EU/UK only' decides per visitor from the country header or time zone."
            >
              <select
                className="input"
                value={site.settings.consent}
                onChange={(e) => save({ settings: { consent: e.target.value as SiteSettings["consent"] } })}
              >
                <option value="none">Not required</option>
                <option value="eu">EU, EEA, UK and Switzerland</option>
                <option value="always">Everyone</option>
              </select>
            </Setting>
            <Toggle
              title="Honour Do Not Track and Global Privacy Control"
              checked={site.settings.respectDnt}
              onChange={(v) => save({ settings: { respectDnt: v } })}
            />
            <Toggle title="Click heatmaps" checked={site.settings.heatmaps} onChange={(v) => save({ settings: { heatmaps: v } })} />
            <Toggle
              title="Session recordings"
              checked={site.settings.replay.enabled}
              onChange={(v) => save({ settings: { replay: { ...site.settings.replay, enabled: v } } })}
            />
            <Setting title="Recording sample rate" help="Share of page loads that are recorded.">
              <select
                className="input"
                value={site.settings.replay.sampleRate}
                onChange={(e) => save({ settings: { replay: { ...site.settings.replay, sampleRate: Number(e.target.value) } } })}
              >
                {[1, 0.5, 0.25, 0.1, 0.05, 0.01].map((r) => (
                  <option key={r} value={r}>
                    {r * 100}%
                  </option>
                ))}
              </select>
            </Setting>
            <Toggle
              title="Mask everything typed into inputs in recordings"
              checked={site.settings.replay.maskInputs}
              onChange={(v) => save({ settings: { replay: { ...site.settings.replay, maskInputs: v } } })}
            />
            <Setting
              title="Strip URL parameters"
              help="Removed in the browser before sending. Paths are stored without query strings anyway; UTM tags are read first."
            >
              <input
                className="input w-72"
                defaultValue={site.settings.stripParams.join(", ")}
                onBlur={(e) =>
                  save({
                    settings: {
                      stripParams: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </Setting>
          </div>
        </Card>

        <TagManager />

        {site.can_edit && site.api_key && (
          <Card title="Server-side ingestion" subtitle="For mobile apps, back ends, CRMs, point-of-sale and offline conversions.">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-2">API key</span>
              <code className="rounded bg-surface-2 px-2 py-1">{site.api_key}</code>
              <button
                className="btn h-7 text-xs"
                onClick={() => confirm("Rotate the key? The old one stops working immediately.") && save({ rotateKey: true })}
              >
                Rotate
              </button>
            </div>
            <CodeBlock
              code={`curl -X POST ${origin}/api/ingest \\
  -H "Authorization: Bearer ${site.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "site": "${site.id}",
    "events": [{
      "name": "purchase", "user_id": "crm-4411", "revenue": 120,
      "platform": "pos", "timestamp": "${new Date().toISOString().slice(0, 10)}T10:30:00Z",
      "props": { "store": "Bandra", "item": "House Espresso" }
    }]
  }'`}
            />
          </Card>
        )}

        {site.can_edit && <DangerZone site={site} />}
      </fieldset>
    </>
  );
}

function Setting({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="max-w-xl">
        <div className="text-sm font-medium">{title}</div>
        {help && <p className="text-xs text-ink-2">{help}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ title, checked, onChange }: { title: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Setting title={title}>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--line)" }}
      >
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: checked ? 22 : 2 }} />
      </button>
    </Setting>
  );
}

function GeneralForm({ site, onSave }: { site: Site; onSave: (p: Partial<Site>) => Promise<void> }) {
  const [name, setName] = useState(site.name);
  const [domain, setDomain] = useState(site.domain);
  const [timezone, setTimezone] = useState(site.timezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [timezone];
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave({ name, domain, timezone });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="label">Name</span>
        <input className="input w-56" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Domain</span>
        <input className="input w-56" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Reporting time zone</span>
        <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary">{saved ? "Saved ✓" : "Save"}</button>
      <span className="text-xs text-muted">
        Site ID <code>{site.id}</code>
      </span>
      {error && <ErrorNote message={error} />}
    </form>
  );
}

function TagManager() {
  const { siteId } = useDashboard();
  const { data: tags, reload } = useApi<Tag[]>(`/api/sites/${siteId}/tags`);
  const [kind, setKind] = useState<Tag["kind"]>("click");
  const [match, setMatch] = useState("");
  const [event, setEvent] = useState("");
  const [consent, setConsent] = useState("analytics");
  const [error, setError] = useState<string | null>(null);
  const placeholder = {
    click: "CSS selector, e.g. .buy-button",
    submit: "Form selector, e.g. #contact",
    pageview: "Page path, e.g. /thank-you or /blog/*",
    script: "https://…/pixel.js",
  }[kind];
  return (
    <Card
      title="Tag manager"
      subtitle="Turn clicks, form submits and page visits into events, or load third-party scripts after consent, without editing the site."
    >
      <ul className="mb-4 divide-y divide-line text-sm">
        {(tags ?? []).map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium uppercase">{t.kind}</span>
              <code>{t.match}</code>
              {t.event && (
                <>
                  {" "}
                  → <code className="text-accent-ink">{t.event}</code>
                </>
              )}
              <span className="ml-2 text-xs text-muted">consent: {t.consent}</span>
            </span>
            <button
              className="text-muted hover:text-ink disabled:hidden"
              aria-label="Delete tag"
              onClick={async () => {
                await send(`/api/sites/${siteId}/tags?item=${t.id}`, "DELETE");
                reload();
              }}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
        {tags?.length === 0 && <li className="py-2 text-muted">No tags yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await send(`/api/sites/${siteId}/tags`, "POST", { kind, match, event: kind === "script" ? undefined : event, consent });
            setMatch("");
            setEvent("");
            reload();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Tag["kind"])} aria-label="Trigger">
          <option value="click">On click</option>
          <option value="submit">On form submit</option>
          <option value="pageview">On page view</option>
          <option value="script">Load script</option>
        </select>
        <input className="input w-72" required placeholder={placeholder} value={match} onChange={(e) => setMatch(e.target.value)} aria-label="Match" />
        {kind !== "script" && (
          <input className="input w-44" required placeholder="event_name" value={event} onChange={(e) => setEvent(e.target.value)} aria-label="Event name" />
        )}
        <select className="input" value={consent} onChange={(e) => setConsent(e.target.value)} aria-label="Consent category">
          <option value="necessary">Necessary</option>
          <option value="analytics">Analytics</option>
          <option value="marketing">Marketing</option>
        </select>
        <button className="btn">
          <Plus size={14} /> Add tag
        </button>
        {error && <ErrorNote message={error} />}
      </form>
    </Card>
  );
}

function DangerZone({ site }: { site: Site }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  return (
    <Card title="Delete site">
      <p className="mb-3 text-sm text-ink-2">
        Deletes the site and all of its sessions, events, clicks and recordings. This cannot be undone. Type <b>{site.id}</b> to confirm.
      </p>
      <div className="flex gap-2">
        <input className="input w-48" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Site id to confirm" />
        <button
          className="btn"
          style={{ color: "var(--critical)" }}
          disabled={confirmText !== site.id}
          onClick={async () => {
            await send(`/api/sites/${site.id}`, "DELETE");
            router.push("/dashboard");
          }}
        >
          <Trash2 size={14} /> Delete permanently
        </button>
      </div>
    </Card>
  );
}
