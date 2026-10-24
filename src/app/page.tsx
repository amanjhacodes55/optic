import { BarChart3, Database, Flame, GitBranch, Lock, MousePointerClick, PlayCircle, Radio, ShieldCheck, Sparkles, Tags, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/dashboard/shell";

const GROUPS = [
  {
    title: "Data collection and integration",
    icon: Database,
    items: [
      "One 6 KB script; single-page apps tracked automatically",
      "Server ingest API for mobile apps, back ends, CRM and point-of-sale data",
      "No-code tag manager: clicks, form submits and page rules become events",
      "Cookieless by default, consent modes for the EU, DNT and GPC honoured",
    ],
  },
  {
    title: "Traffic and audience",
    icon: Users,
    items: ["GA4-style channel grouping from UTM tags and referrers", "Segments by country, device, browser, OS, language, campaign", "Realtime view refreshed every 5 seconds", "Every report filterable by any dimension"],
  },
  {
    title: "Behaviour",
    icon: GitBranch,
    items: ["Automatic outbound clicks, downloads, form submits, video plays", "Closed funnels with drop-off and time between steps", "Path exploration before and after any page", "Weekly retention cohorts"],
  },
  {
    title: "Conversions and e-commerce",
    icon: BarChart3,
    items: ["Event and page goals with values", "Revenue, orders, average order value", "Cart and checkout abandonment", "Products and revenue by channel"],
  },
  {
    title: "Experience (like Clarity)",
    icon: Flame,
    items: ["Click and scroll heatmaps over the live page", "Session recordings with masked inputs", "Rage clicks, dead clicks and JavaScript errors", "Core Web Vitals from real users"],
  },
  {
    title: "Automation and reporting",
    icon: Sparkles,
    items: ["Anomaly detection with robust, weekday-aware baselines", "Holt-Winters forecast with an 80% interval", "\"What changed\" contribution analysis", "Custom report builder with CSV export"],
  },
];

export default function Home() {
  return (
    <div className="w-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Logo size={26} /> Optic
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <a className="btn hidden border-transparent bg-transparent sm:inline-flex" href="https://github.com/amanjhacodes55/optic#readme">
            Docs
          </a>
          <a className="btn" href="https://github.com/amanjhacodes55/optic">
            GitHub
          </a>
          <Link className="btn btn-primary" href="/dashboard/demo">
            Open the demo
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
        <div className="max-w-3xl">
          <span className="chip mb-5">Open source · MIT licensed · Self-hosted</span>
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Web analytics you own, with heatmaps and replays built in.</h1>
          <p className="mt-5 text-lg text-ink-2">
            Optic gives you the reports you use in Google Analytics 4, the heatmaps and session recordings you use in Microsoft Clarity, and forecasting on top, in one
            Next.js app that stores everything in a single SQLite file on your own server.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn btn-primary h-11 px-5 text-base" href="/dashboard/demo">
              Explore the live demo →
            </Link>
            <a className="btn h-11 px-5 text-base" href="https://github.com/amanjhacodes55/optic#quick-start">
              Self-host in 2 minutes
            </a>
          </div>
        </div>
        <div className="card mt-12 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="h-2.5 w-2.5 rounded-full bg-line" />
            <span className="ml-2">Add one line to your site</span>
          </div>
          <pre className="overflow-x-auto p-5 text-sm leading-relaxed">
            <span className="text-muted">{"<!-- in <head>, on every page -->"}</span>
            {"\n"}
            {'<script defer src="https://analytics.example.com/optic.js" data-site="YOUR_SITE_ID"></script>'}
          </pre>
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-px px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="p-5">
              <g.icon size={22} className="text-accent" />
              <h2 className="mt-3 font-semibold">{g.title}</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-2">
                {g.items.map((i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-muted">
                      –
                    </span>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Private by design</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Lock, title: "No cookies by default", text: "Visitors are counted with a hash that uses a salt rotated every day. The salt is deleted, so nobody can be followed across days." },
            { icon: ShieldCheck, title: "Your data stays with you", text: "Everything lives in one SQLite file on your server. No third party sees a single pageview. Export any report to CSV." },
            { icon: MousePointerClick, title: "Recordings mask input", text: "Everything typed into form fields is masked before it leaves the browser. Add optic-block to hide any element." },
          ].map((c) => (
            <div key={c.title} className="card p-5">
              <c.icon size={20} className="text-accent" />
              <h3 className="mt-3 font-semibold">{c.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{c.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Radio, label: "Realtime", href: "/dashboard/demo/realtime" },
            { icon: PlayCircle, label: "Session recordings", href: "/dashboard/demo/recordings" },
            { icon: Tags, label: "Insights and forecasts", href: "/dashboard/demo/insights" },
          ].map((l) => (
            <Link key={l.label} href={l.href} className="card flex items-center justify-between p-4 hover:bg-surface-2">
              <span className="flex items-center gap-2 font-medium">
                <l.icon size={18} className="text-accent" /> {l.label}
              </span>
              <span className="text-muted">→</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:px-6">
          <span>Optic is free software under the MIT License.</span>
          <span>
            Try the tracked demo shop at <a className="text-accent-ink hover:underline" href="/demo">/demo</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
