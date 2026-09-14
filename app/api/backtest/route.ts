import { NextRequest, NextResponse } from "next/server";
import { loadOhlcData } from "@/lib/csv";
import { runBacktest } from "@/lib/backtest";
import type { ExperimentParams } from "@/lib/types";

const REQUIRED_NUMERIC_FIELDS: (keyof ExperimentParams)[] = [
  "thresholdPct",
  "lookbackDays",
  "holdingPeriodDays",
  "costsPct",
];

/**
 * POST /api/backtest
 * Body: ExperimentParams
 *
 * TEST stage. This route does no LLM work at all -- it loads the static
 * CSV and calls the pure, deterministic lib/backtest.ts engine. Kept as
 * its own route (rather than folded into /api/explain) so the "hard
 * numbers" step is visibly separate from the "interpretation" step, both
 * in the code and in the network tab.
 */
export async function POST(req: NextRequest) {
  try {
    const params = (await req.json()) as Partial<ExperimentParams>;

    for (const field of REQUIRED_NUMERIC_FIELDS) {
      if (typeof params[field] !== "number" || Number.isNaN(params[field])) {
        return NextResponse.json(
          { error: `Field '${field}' must be a number.` },
          { status: 400 }
        );
      }
    }
    if (!params.testPeriodStart || !params.testPeriodEnd) {
      return NextResponse.json(
        { error: "testPeriodStart and testPeriodEnd are required." },
        { status: 400 }
      );
    }
    if (params.direction !== "long" && params.direction !== "short") {
      return NextResponse.json(
        { error: "direction must be 'long' or 'short'." },
        { status: 400 }
      );
    }
    if (params.moveDirection !== "fall" && params.moveDirection !== "rise") {
      return NextResponse.json(
        { error: "moveDirection must be 'fall' or 'rise'." },
        { status: 400 }
      );
    }

    const data = loadOhlcData();
    const result = runBacktest(data, params as ExperimentParams);
    return NextResponse.json(result);
  } catch (err) {
    console.error("/api/backtest error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
