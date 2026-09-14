import { readFileSync } from "fs";
import path from "path";
import type { OhlcRow } from "./types";

/**
 * Loads and parses the static historical price CSV.
 *
 * Reading the file with `fs` (rather than fetching it) keeps this on the
 * server side only, and keeps the backtest engine itself free of any I/O so
 * it stays a pure, unit-testable function (see lib/backtest.ts).
 */
export function loadOhlcData(
  csvPath: string = path.join(process.cwd(), "data", "nifty_daily.csv")
): OhlcRow[] {
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.trim().split("\n");
  const [header, ...rows] = lines;
  const columns = header.split(",").map((c) => c.trim().toLowerCase());

  const dateIdx = columns.indexOf("date");
  const openIdx = columns.indexOf("open");
  const highIdx = columns.indexOf("high");
  const lowIdx = columns.indexOf("low");
  const closeIdx = columns.indexOf("close");

  if ([dateIdx, openIdx, highIdx, lowIdx, closeIdx].includes(-1)) {
    throw new Error(
      "nifty_daily.csv must have columns: date, open, high, low, close"
    );
  }

  return rows
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(",");
      return {
        date: cells[dateIdx].trim(),
        open: Number(cells[openIdx]),
        high: Number(cells[highIdx]),
        low: Number(cells[lowIdx]),
        close: Number(cells[closeIdx]),
      };
    })
    // Historical data must be in ascending date order for the backtest
    // engine's look-ahead guard to be meaningful.
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Returns the [earliest, latest] date covered by a sorted OHLC dataset. */
export function getDateRange(data: OhlcRow[]): [string, string] {
  if (data.length === 0) throw new Error("No OHLC data loaded.");
  return [data[0].date, data[data.length - 1].date];
}
