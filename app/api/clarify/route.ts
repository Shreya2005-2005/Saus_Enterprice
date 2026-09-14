import { NextRequest, NextResponse } from "next/server";
import { getDateRange, loadOhlcData } from "@/lib/csv";
import { clarifyQuestion } from "@/lib/llm";

/**
 * POST /api/clarify
 * Body: { question: string }
 *
 * ASK -> CLARIFY. Sends the user's free-text question to the LLM and
 * returns the structured field list (specified / assumption / question)
 * plus a draft hypothesis. This is the only network call the CLARIFY and
 * DEFINE stages need -- once the user has resolved every field in the UI,
 * assembling the Experiment Card is pure client-side logic.
 */
export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'question' string." },
        { status: 400 }
      );
    }

    const data = loadOhlcData();
    const [from, to] = getDateRange(data);

    const result = await clarifyQuestion(question.trim(), from, to);
    return NextResponse.json(result);
  } catch (err) {
    console.error("/api/clarify error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
