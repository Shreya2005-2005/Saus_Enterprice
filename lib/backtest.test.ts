import { describe, expect, it } from "vitest";
import { runBacktest } from "./backtest";
import type { ExperimentParams, OhlcRow } from "./types";

/**
 * These tests exist to prove the point made in lib/backtest.ts's top
 * comment: this is a pure function over an array, so it can be tested with
 * small, hand-checked synthetic data instead of needing the real CSV or
 * any network/LLM call.
 */

function makeRows(closes: number[], startDate = "2024-01-01"): OhlcRow[] {
  const start = new Date(startDate + "T00:00:00Z");
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return { date, open: close, high: close, low: close, close };
  });
}

function baseParams(overrides: Partial<ExperimentParams> = {}): ExperimentParams {
  return {
    instrument: "TEST",
    direction: "long",
    moveDirection: "fall",
    thresholdPct: 4,
    lookbackDays: 1,
    holdingPeriodDays: 3,
    testPeriodStart: "2024-01-01",
    testPeriodEnd: "2024-12-31",
    costsPct: 0,
    ...overrides,
  };
}

describe("runBacktest", () => {
  it("enters on a qualifying sharp fall and exits after the fixed holding period", () => {
    // Day index:      0    1    2    3   4   5   6    7    8    9
    const closes = [100, 100, 100, 95, 96, 97, 98, 99, 100, 101];
    const rows = makeRows(closes);

    const result = runBacktest(rows, baseParams());

    // -5% move on day 3 triggers (threshold 4%). Entry at close=95,
    // exit 3 trading days later at close=98.
    expect(result.numTrades).toBe(1);
    expect(result.trades[0].entryDate).toBe(rows[3].date);
    expect(result.trades[0].exitDate).toBe(rows[6].date);
    expect(result.trades[0].returnPct).toBeCloseTo(3.16, 2);
    expect(result.winRatePct).toBe(100);
  });

  it("subtracts round-trip costs from the raw return", () => {
    const closes = [100, 100, 100, 95, 96, 97, 98, 99, 100, 101];
    const rows = makeRows(closes);

    const result = runBacktest(rows, baseParams({ costsPct: 1 }));

    expect(result.trades[0].returnPct).toBeCloseTo(2.16, 2);
  });

  it("never opens a second trade before the previous one has exited (no overlap)", () => {
    // Falls on day 2 and day 3 -- only the first should trigger, since the
    // 3-day hold from day 2 doesn't exit until day 5.
    const closes = [100, 100, 95, 90, 91, 92, 93, 94, 95, 96];
    const rows = makeRows(closes);

    const result = runBacktest(rows, baseParams({ thresholdPct: 4 }));

    expect(result.numTrades).toBe(1);
    expect(result.trades[0].entryDate).toBe(rows[2].date);
  });

  it("supports the short/rise combination as a mirror image of long/fall", () => {
    // A sharp rise, shorted: profit when price falls back after entry.
    const closes = [100, 100, 100, 108, 107, 106, 105, 100, 99, 98];
    const rows = makeRows(closes);

    const result = runBacktest(
      rows,
      baseParams({ direction: "short", moveDirection: "rise", thresholdPct: 5 })
    );

    expect(result.numTrades).toBe(1);
    // Entry at 108 (day 3), exit at 105 (day 6): short profits from the fall.
    expect(result.trades[0].returnPct).toBeCloseTo(2.78, 2);
  });

  it("never uses a data point beyond what should be available at entry time", () => {
    // A huge future crash (day 9) must not affect a trade entered on day 3,
    // since exit is fixed at day 3 + holdingPeriodDays = day 6.
    const closes = [100, 100, 100, 95, 96, 97, 98, 99, 100, 1];
    const rows = makeRows(closes);

    const result = runBacktest(rows, baseParams());

    expect(result.trades[0].exitDate).toBe(rows[6].date);
    expect(result.trades[0].returnPct).toBeCloseTo(3.16, 2);
  });

  it("flags small samples and short test periods", () => {
    const closes = [100, 100, 95, 94, 93, 92];
    const rows = makeRows(closes);

    const result = runBacktest(
      rows,
      baseParams({
        thresholdPct: 4,
        holdingPeriodDays: 2,
        testPeriodStart: "2024-01-01",
        testPeriodEnd: "2024-01-06",
      })
    );

    expect(result.smallSample).toBe(true);
    expect(result.shortPeriod).toBe(true);
  });

  it("returns zeroed-out stats when no trade ever qualifies", () => {
    const closes = [100, 101, 102, 103, 104, 105];
    const rows = makeRows(closes);

    const result = runBacktest(rows, baseParams({ thresholdPct: 50 }));

    expect(result.numTrades).toBe(0);
    expect(result.winRatePct).toBe(0);
    expect(result.avgReturnPct).toBe(0);
    expect(result.maxDrawdownPct).toBe(0);
  });
});
