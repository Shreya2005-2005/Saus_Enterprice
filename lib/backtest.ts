import type { BacktestResult, ExperimentParams, OhlcRow, Trade } from "./types";

/**
 * Deterministic backtest engine.
 *
 * WHY this file has zero LLM involvement and zero I/O:
 * The whole premise of the product is that the "hard numbers" in the LEARN
 * stage must be trustworthy. An LLM cannot reliably do exact arithmetic
 * over hundreds of rows, and asking it to "estimate" a backtest result
 * would silently reintroduce the same made-up-number problem the product
 * is trying to solve. So this function is a pure, synchronous, unit
 * testable calculation: same input array + same params -> same output,
 * every time. The LLM only ever sees the *output* of this function, to
 * explain it in plain English (see lib/llm.ts).
 *
 * Look-ahead bias guard:
 * At the moment a trade is evaluated for entry on day `i`, only rows
 * `0..i` are read (the move is measured as the return from day `i -
 * lookbackDays` to day `i`, inclusive). The entry price is that same day's
 * close, which is data available "as of" day i. No row with an index > i
 * is touched until the trade has already been entered. The exit similarly
 * only reads `i + holdingPeriodDays`, i.e. a fixed number of trading days
 * *after* entry, which is a rule fixed at entry time, not a decision made
 * using future information.
 */
export function runBacktest(
  data: OhlcRow[],
  params: ExperimentParams
): BacktestResult {
  const rows = data.filter(
    (row) => row.date >= params.testPeriodStart && row.date <= params.testPeriodEnd
  );

  const trades: Trade[] = [];

  // Start at `lookbackDays` so there is enough history to measure the
  // triggering move, and stop early enough that `holdingPeriodDays` of
  // future data exists to exit the trade.
  let i = params.lookbackDays;
  while (i < rows.length - params.holdingPeriodDays) {
    const anchor = rows[i - params.lookbackDays];
    const today = rows[i];

    const movePct = ((today.close - anchor.close) / anchor.close) * 100;

    const isSharpFall = params.moveDirection === "fall" && movePct <= -params.thresholdPct;
    const isSharpRise = params.moveDirection === "rise" && movePct >= params.thresholdPct;

    if (isSharpFall || isSharpRise) {
      const entryIdx = i;
      const exitIdx = i + params.holdingPeriodDays;
      const entryRow = rows[entryIdx];
      const exitRow = rows[exitIdx];

      const rawReturnPct =
        ((exitRow.close - entryRow.close) / entryRow.close) *
        100 *
        (params.direction === "long" ? 1 : -1);

      // Round-trip cost is charged once per trade (entry + exit combined),
      // expressed directly in percentage points for simplicity.
      const netReturnPct = rawReturnPct - params.costsPct;

      trades.push({
        entryDate: entryRow.date,
        entryPrice: entryRow.close,
        exitDate: exitRow.date,
        exitPrice: exitRow.close,
        returnPct: round2(netReturnPct),
      });

      // Advance past this trade's exit so trades never overlap. Overlapping
      // trades would double-count the same market move and inflate the
      // apparent number of independent samples.
      i = exitIdx + 1;
    } else {
      i += 1;
    }
  }

  const numTrades = trades.length;
  const winRatePct = numTrades === 0
    ? 0
    : (trades.filter((t) => t.returnPct > 0).length / numTrades) * 100;
  const avgReturnPct = numTrades === 0
    ? 0
    : trades.reduce((sum, t) => sum + t.returnPct, 0) / numTrades;

  const maxDrawdownPct = computeMaxDrawdown(trades);

  const periodDays =
    (new Date(params.testPeriodEnd).getTime() -
      new Date(params.testPeriodStart).getTime()) /
    (1000 * 60 * 60 * 24);

  return {
    numTrades,
    winRatePct: round2(winRatePct),
    avgReturnPct: round2(avgReturnPct),
    maxDrawdownPct: round2(maxDrawdownPct),
    trades,
    // Thresholds chosen to match the brief: ~30 trades is the rough point
    // below which win-rate/avg-return statistics are too noisy to trust.
    smallSample: numTrades < 30,
    shortPeriod: periodDays < 365,
  };
}

/**
 * Max drawdown of the equity curve formed by compounding each trade's net
 * return sequentially (i.e. capital is fully redeployed trade to trade).
 * This is a simplification -- trades don't literally overlap in time with
 * idle capital between them -- but it is the standard, easily-explained way
 * to summarize a non-overlapping trade sequence's downside.
 */
function computeMaxDrawdown(trades: Trade[]): number {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;

  for (const trade of trades) {
    equity *= 1 + trade.returnPct / 100;
    peak = Math.max(peak, equity);
    const drawdown = ((peak - equity) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  return maxDrawdown;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
