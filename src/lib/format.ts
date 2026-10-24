// Display formatting shared by the dashboard. Everything compacts from 1,000 up.

export function num(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(digits).replace(/\.0$/, "") + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(digits).replace(/\.0$/, "") + "M";
  if (abs >= 1e4) return (n / 1e3).toFixed(digits).replace(/\.0$/, "") + "K";
  if (abs >= 1e3) return Math.round(n).toLocaleString("en-US");
  return Number.isInteger(n) ? String(n) : n.toFixed(abs < 10 ? 2 : 1).replace(/\.?0+$/, "");
}

export function full(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("en-US");
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return (n * 100).toFixed(digits).replace(/\.0$/, "") + "%";
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function money(n: number | null | undefined, currency = "USD", compact = true): string {
  if (n == null || !Number.isFinite(n)) return "–";
  if (compact && Math.abs(n) >= 1e4) {
    const sym = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "";
    return sym + num(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 }).format(n);
}

export function ms(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  return n >= 1000 ? (n / 1000).toFixed(2) + " s" : Math.round(n) + " ms";
}

export function delta(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return (current - previous) / previous;
}

export function shortDate(label: string): string {
  // "2026-10-24" -> "Oct 24"; "2026-10-24 13:00" -> "13:00"
  if (label.length > 10) return label.slice(11);
  const d = new Date(label + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDate(label: string): string {
  if (label.length > 10) {
    const d = new Date(label.replace(" ", "T") + ":00Z");
    return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", timeZone: "UTC" });
  }
  const d = new Date(label + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
