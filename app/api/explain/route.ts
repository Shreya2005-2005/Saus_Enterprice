import { NextRequest, NextResponse } from "next/server";
import { explainResults } from "@/lib/llm";
import type { BacktestResult, Experiment } from "@/lib/types";

/**
 * POST /api/explain
 * Body: { experiment: Experiment, result: BacktestResult }
 *
 * LEARN stage. Takes the already-computed backtest numbers and asks the
 * LLM only to interpret them in plain English -- it never recomputes or
 * second-guesses the numbers themselves.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      experiment?: Experiment;
      result?: BacktestResult;
    };

    if (!body.experiment || !body.result) {
      return NextResponse.json(
        { error: "Request body must include 'experiment' and 'result'." },
        { status: 400 }
      );
    }

    const explanation = await explainResults(body.experiment, body.result);
    return NextResponse.json(explanation);
  } catch (err) {
    console.error("/api/explain error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
