/**
 * Generates a static, reproducible CSV of synthetic NIFTY-like daily OHLC
 * data at /data/nifty_daily.csv, for local development and demo purposes
 * (in place of a real market data provider).
 *
 * A seeded PRNG is used so the file is reproducible -- re-running this
 * script always produces the exact same CSV, which matters for a
 * deterministic backtest engine.
 *
 * Run with: node scripts/generate-data.mjs
 */
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple mulberry32 seeded PRNG for reproducibility.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

// Standard-normal sample via Box-Muller, driven by the seeded PRNG.
function gaussian() {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

const START_DATE = new Date("2021-01-01T00:00:00Z");
const NUM_TRADING_DAYS = 1000;
const START_PRICE = 14000;
const DAILY_DRIFT = 0.00035; // slight long-run upward drift
const DAILY_VOL = 0.011; // ~1.1% daily volatility, in line with NIFTY

const rows = [];
let close = START_PRICE;
let vol = DAILY_VOL;
const date = new Date(START_DATE);

while (rows.length < NUM_TRADING_DAYS) {
  if (isWeekend(date)) {
    date.setUTCDate(date.getUTCDate() + 1);
    continue;
  }

  // Light volatility clustering: vol mean-reverts toward DAILY_VOL but
  // occasionally spikes, which produces the kind of sharp-fall clusters a
  // "buy the dip" strategy is meant to react to.
  vol = vol * 0.9 + DAILY_VOL * 0.1;
  if (rand() < 0.02) vol *= 3; // occasional shock day

  const prevClose = close;
  const ret = DAILY_DRIFT + gaussian() * vol;
  close = prevClose * (1 + ret);

  const open = prevClose * (1 + gaussian() * vol * 0.2);
  const intradayRange = Math.abs(gaussian()) * vol * prevClose * 0.6;
  const high = Math.max(open, close) + intradayRange;
  const low = Math.min(open, close) - intradayRange;

  rows.push({
    date: formatDate(date),
    open: Math.round(open * 100) / 100,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    close: Math.round(close * 100) / 100,
  });

  date.setUTCDate(date.getUTCDate() + 1);
}

const header = "date,open,high,low,close";
const csv = [header, ...rows.map((r) => `${r.date},${r.open},${r.high},${r.low},${r.close}`)].join(
  "\n"
);

const outPath = path.join(__dirname, "..", "data", "nifty_daily.csv");
writeFileSync(outPath, csv + "\n", "utf-8");

console.log(`Wrote ${rows.length} rows to ${outPath}`);
console.log(`Date range: ${rows[0].date} -> ${rows[rows.length - 1].date}`);
console.log(`Price range: ${START_PRICE} -> ${rows[rows.length - 1].close}`);
