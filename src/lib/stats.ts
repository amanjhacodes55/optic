// Small, dependency-free statistics used by the Insights page. Each function is pure so it can
// be unit tested without a database.

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export type Anomaly = { index: number; label: string; value: number; expected: number; score: number; direction: "spike" | "drop" };

/**
 * Flags days that are far from what the recent past predicts. The expectation for each day is
 * the median of the same weekday over the previous `lookbackWeeks` weeks (so a quiet Sunday is
 * not an anomaly), and the spread is the median absolute deviation of recent residuals. A robust
 * z-score above `threshold` is flagged. MAD is used instead of the standard deviation so one
 * spike does not hide the next one.
 */
export function detectAnomalies(series: { label: string; value: number }[], opts: { lookbackWeeks?: number; threshold?: number; minHistory?: number } = {}): Anomaly[] {
  const lookback = opts.lookbackWeeks ?? 4;
  const threshold = opts.threshold ?? 3.5;
  const minHistory = opts.minHistory ?? 14;
  const out: Anomaly[] = [];
  const residuals: number[] = [];
  for (let i = 0; i < series.length; i++) {
    const sameDay: number[] = [];
    for (let k = 1; k <= lookback; k++) if (i - 7 * k >= 0) sameDay.push(series[i - 7 * k].value);
    if (i < minHistory || sameDay.length < 2) continue;
    const expected = median(sameDay);
    const recent = residuals.slice(-28);
    const mad = median(recent.map((r) => Math.abs(r - median(recent)))) || 1e-9;
    const residual = series[i].value - expected;
    const scale = Math.max(1.4826 * mad, 0.05 * Math.max(expected, 1), 1);
    const score = residual / scale;
    if (Math.abs(score) >= threshold) {
      out.push({ index: i, label: series[i].label, value: series[i].value, expected, score, direction: score > 0 ? "spike" : "drop" });
    } else {
      residuals.push(residual); // anomalies stay out of the baseline
    }
  }
  return out;
}

export type Forecast = { label: string; value: number; low: number; high: number }[];

/**
 * Additive Holt-Winters (level + trend + weekly season), fit by a small grid search over the
 * smoothing constants that minimises one-step-ahead squared error. The 80% interval widens with
 * the horizon using the in-sample residual spread.
 */
export function holtWinters(values: number[], horizon: number, period = 7): { forecast: number[]; low: number[]; high: number[]; fitted: number[]; params: { alpha: number; beta: number; gamma: number } } {
  const n = values.length;
  if (n < period * 2) {
    const m = mean(values);
    const sd = stddev(values);
    return { forecast: Array(horizon).fill(m), low: Array(horizon).fill(Math.max(0, m - 1.28 * sd)), high: Array(horizon).fill(m + 1.28 * sd), fitted: values.slice(), params: { alpha: 0, beta: 0, gamma: 0 } };
  }
  const grid = [0.05, 0.15, 0.3, 0.5, 0.7];
  let best: { sse: number; alpha: number; beta: number; gamma: number } = { sse: Infinity, alpha: 0.3, beta: 0.05, gamma: 0.3 };
  for (const alpha of grid)
    for (const beta of [0.01, 0.05, 0.15])
      for (const gamma of grid) {
        const { sse } = run(values, period, alpha, beta, gamma, 0);
        if (sse < best.sse) best = { sse, alpha, beta, gamma };
      }
  const r = run(values, period, best.alpha, best.beta, best.gamma, horizon);
  const resid = values.slice(period).map((v, i) => v - r.fitted[i + period]);
  const sd = stddev(resid);
  const low = r.forecast.map((f, h) => Math.max(0, f - 1.28 * sd * Math.sqrt(1 + h * best.alpha ** 2)));
  const high = r.forecast.map((f, h) => f + 1.28 * sd * Math.sqrt(1 + h * best.alpha ** 2));
  return { forecast: r.forecast.map((f) => Math.max(0, f)), low, high, fitted: r.fitted, params: { alpha: best.alpha, beta: best.beta, gamma: best.gamma } };
}

function run(y: number[], m: number, alpha: number, beta: number, gamma: number, horizon: number) {
  const firstSeason = mean(y.slice(0, m));
  const secondSeason = mean(y.slice(m, 2 * m));
  let level = firstSeason;
  let trend = (secondSeason - firstSeason) / m;
  const season = y.slice(0, m).map((v) => v - firstSeason);
  const fitted: number[] = [];
  let sse = 0;
  for (let t = 0; t < y.length; t++) {
    const s = season[t % m];
    const pred = level + trend + s;
    fitted.push(pred);
    if (t >= m) sse += (y[t] - pred) ** 2;
    const prevLevel = level;
    level = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    season[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
  }
  const forecast = Array.from({ length: horizon }, (_, h) => level + (h + 1) * trend + season[(y.length + h) % m]);
  return { fitted, forecast, sse };
}

export type Contribution = { value: string; current: number; previous: number; change: number; share: number };

/**
 * "What changed": splits the change in a total between two periods into the segments that
 * caused it. Each segment's share is its signed change divided by the total change.
 */
export function contributions(current: Map<string, number>, previous: Map<string, number>, top = 6): { total: { current: number; previous: number }; rows: Contribution[] } {
  const keys = new Set([...current.keys(), ...previous.keys()]);
  const totalCur = [...current.values()].reduce((a, b) => a + b, 0);
  const totalPrev = [...previous.values()].reduce((a, b) => a + b, 0);
  const delta = totalCur - totalPrev;
  const rows = [...keys]
    .map((k) => {
      const c = current.get(k) ?? 0;
      const p = previous.get(k) ?? 0;
      return { value: k, current: c, previous: p, change: c - p, share: delta ? (c - p) / Math.abs(delta) : 0 };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, top);
  return { total: { current: totalCur, previous: totalPrev }, rows };
}
