import { describe, expect, it } from "vitest";
import { contributions, detectAnomalies, holtWinters, median, quantile } from "@/lib/stats";

// A weekly pattern with mild noise: weekdays ~100, weekends ~60.
function weekly(days: number, seed = 1) {
  let s = seed;
  const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 8;
  return Array.from({ length: days }, (_, i) => ({ label: `d${i}`, value: (i % 7 >= 5 ? 60 : 100) + noise() }));
}

describe("basic statistics", () => {
  it("median and quantile", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("detectAnomalies", () => {
  it("ignores normal weekly seasonality (quiet weekends are not anomalies)", () => {
    expect(detectAnomalies(weekly(70))).toEqual([]);
  });

  it("finds an injected drop and spike, and gets the direction right", () => {
    const s = weekly(70);
    s[50].value = 20; // outage
    s[60].value = 260; // launch day
    const found = detectAnomalies(s);
    expect(found.map((a) => [a.index, a.direction])).toEqual([
      [50, "drop"],
      [60, "spike"],
    ]);
    expect(found[0].expected).toBeGreaterThan(80);
  });

  it("needs history before it flags anything", () => {
    const s = weekly(10);
    s[3].value = 1000;
    expect(detectAnomalies(s)).toEqual([]);
  });
});

describe("holtWinters", () => {
  it("forecasts the weekly shape and a sensible interval", () => {
    const values = weekly(84).map((p) => p.value);
    const { forecast, low, high } = holtWinters(values, 14);
    expect(forecast).toHaveLength(14);
    // Day 84 is a weekday (84 % 7 = 0), days 89-90 fall on the weekend.
    expect(forecast[0]).toBeGreaterThan(85);
    expect(forecast[5]).toBeLessThan(75);
    forecast.forEach((f, i) => {
      expect(low[i]).toBeLessThanOrEqual(f);
      expect(high[i]).toBeGreaterThanOrEqual(f);
    });
  });

  it("follows a trend", () => {
    const values = Array.from({ length: 56 }, (_, i) => 100 + i * 2);
    const { forecast } = holtWinters(values, 7);
    expect(forecast[6]).toBeGreaterThan(values[55]);
  });

  it("falls back to the mean when there is too little data", () => {
    expect(holtWinters([10, 12, 14], 3).forecast).toEqual([12, 12, 12]);
  });
});

describe("contributions", () => {
  it("splits a total change by segment, biggest movers first", () => {
    const { total, rows } = contributions(
      new Map([["Email", 50], ["Search", 120], ["Direct", 100]]),
      new Map([["Email", 150], ["Search", 100], ["Direct", 100]]),
    );
    expect(total).toEqual({ current: 270, previous: 350 });
    expect(rows[0]).toMatchObject({ value: "Email", change: -100 });
    expect(rows[0].share).toBeCloseTo(-1.25);
    expect(rows[1]).toMatchObject({ value: "Search", change: 20 });
  });
});
