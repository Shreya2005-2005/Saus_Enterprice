import type {
  BacktestResult,
  ClarifyField,
  ClarifyResult,
  Experiment,
  ExplainResult,
} from "./types";

/**
 * All LLM (Groq) calls live in this one file, deliberately kept separate
 * from lib/backtest.ts. The LLM is good at language -- turning a vague
 * question into structured fields, writing a hypothesis sentence, and
 * explaining numbers in plain English -- but it must never be asked to
 * invent the numbers themselves. Every function here either takes
 * already-computed numbers as input, or produces values that the user
 * explicitly reviews/edits before they're used (see ClarifyField.status).
 */

// NOTE: llama-3.3-70b-versatile (originally requested) has been retired
// from Groq's model lineup. openai/gpt-oss-120b is the closest available
// replacement: a large model with native JSON mode support. Swap this
// constant if your Groq account has a different preferred model -- see
// GET https://api.groq.com/openai/v1/models for what's available to you.
const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/** The 9 structured fields every experiment needs, with UI labels. */
export const EXPERIMENT_FIELD_SPECS: Array<{
  key: keyof Experiment;
  label: string;
}> = [
  { key: "instrument", label: "Instrument" },
  { key: "direction", label: "Direction (long/short)" },
  { key: "moveDirection", label: "Triggering move" },
  { key: "thresholdPct", label: "\"Sharp\" threshold (%)" },
  { key: "lookbackDays", label: "Move measured over (trading days)" },
  { key: "holdingPeriodDays", label: "Holding period (trading days)" },
  { key: "testPeriodStart", label: "Test period start" },
  { key: "testPeriodEnd", label: "Test period end" },
  { key: "costsPct", label: "Round-trip costs (%)" },
];

async function callGroqJson(
  systemPrompt: string,
  userPrompt: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to .env.local (see README.md)."
    );
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq API error (${res.status}): ${body}`);
  }

  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq API returned no content.");
  }

  // response_format: json_object should guarantee pure JSON, but strip
  // markdown code fences defensively in case a model ignores it.
  const cleaned = content.trim().replace(/^```json\s*|^```\s*|```$/g, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Groq API returned malformed JSON: ${cleaned}`);
  }
}

/**
 * CLARIFY stage: parse the free-text question into the fixed set of
 * structured fields the backtest engine needs, plus a draft hypothesis.
 *
 * `dataAvailableFrom`/`dataAvailableTo` are passed in so the model's
 * default test-period assumption stays inside the range the CSV actually
 * covers, instead of hallucinating dates.
 */
export async function clarifyQuestion(
  question: string,
  dataAvailableFrom: string,
  dataAvailableTo: string
): Promise<ClarifyResult> {
  const systemPrompt = `You are a research assistant that turns a vague natural-language trading idea into a structured, testable experiment definition.

The only strategy family this system can backtest is: "react to a sharp N-day move in an instrument by entering a trade, then exit after a fixed holding period." You must map the user's question onto exactly these 9 fields:

- instrument: string. Only daily OHLC data for "NIFTY 50" is available in this prototype. If the user names a different instrument, still set this to "NIFTY 50" but note the substitution.
- direction: "long" or "short" (long = buy, short = sell).
- moveDirection: "fall" or "rise" -- the direction of the triggering move.
- thresholdPct: number, percent. How big the move must be to count as "sharp".
- lookbackDays: integer. Number of trading days over which the move is measured (1 = single-day close-to-close move).
- holdingPeriodDays: integer. Number of trading days the position is held before exiting.
- testPeriodStart: date "YYYY-MM-DD". Must be >= ${dataAvailableFrom}.
- testPeriodEnd: date "YYYY-MM-DD". Must be <= ${dataAvailableTo}.
- costsPct: number, percent. Round-trip brokerage + slippage assumption.

For EVERY field, decide a "status":
- "specified": the user's question directly states or clearly implies this value.
- "assumption": the user did not specify it, but a reasonable default can be proposed. Fill "value" with that default and "note" with a short reason.
- "question": the field is important and genuinely ambiguous enough that you should ask the user directly rather than guess. Use this sparingly (at most 1-2 fields) -- prefer "assumption" whenever a sensible default exists. Still fill "value" with your best-guess default (the user can overwrite it), and fill "question" with a short question.

Also write a one-sentence, plain-English "hypothesis" describing what is being tested, e.g. "NIFTY tends to bounce back within a week after falling more than 2% in a single day."

Respond with ONLY a JSON object of this exact shape:
{
  "fields": [
    { "key": "instrument", "label": "Instrument", "status": "specified|assumption|question", "value": "...", "note": "...", "question": "..." },
    ... one entry per field above, in the same order ...
  ],
  "hypothesis": "..."
}
"note" and "question" are optional -- omit them when not applicable, but always include "value" (your best-guess default even for "question" fields).`;

  const userPrompt = `Trading idea: "${question}"`;

  const json = await callGroqJson(systemPrompt, userPrompt);
  const rawFields = Array.isArray(json.fields) ? json.fields : [];

  // Fallback defaults, used only if the model drops a field entirely (LLM
  // output is non-deterministic even at low temperature). These mirror the
  // defaults the model is instructed to propose, so a dropped field still
  // resolves to a sensible, clearly-labeled assumption instead of a blank
  // input the user is forced to fill in from scratch.
  const fallbackValues: Record<string, string> = {
    instrument: "NIFTY 50",
    direction: "long",
    moveDirection: "fall",
    thresholdPct: "2",
    lookbackDays: "1",
    holdingPeriodDays: "5",
    testPeriodStart: dataAvailableFrom,
    testPeriodEnd: dataAvailableTo,
    costsPct: "0.1",
  };

  // Lenient key matching: tolerate the model returning snake_case or a
  // different casing than the exact camelCase key we asked for.
  const normalizeKey = (k: string) => k.toLowerCase().replace(/[_\s-]/g, "");
  const byNormalizedKey = new Map<string, Record<string, unknown>>();
  for (const f of rawFields) {
    if (f && typeof f === "object" && typeof (f as { key?: unknown }).key === "string") {
      byNormalizedKey.set(normalizeKey((f as { key: string }).key), f as Record<string, unknown>);
    }
  }

  const normalizedFields: ClarifyField[] = EXPERIMENT_FIELD_SPECS.map((spec) => {
    const found = byNormalizedKey.get(normalizeKey(spec.key));
    const status = found?.status;

    return {
      key: spec.key as ClarifyField["key"],
      label: spec.label,
      status: status === "specified" || status === "question" ? status : "assumption",
      // Coerce to string: the model sometimes returns numeric fields (e.g.
      // thresholdPct) as a JSON number rather than a string.
      value:
        found?.value !== undefined && found?.value !== null && found.value !== ""
          ? String(found.value)
          : fallbackValues[spec.key] ?? "",
      note: typeof found?.note === "string" ? found.note : undefined,
      question: typeof found?.question === "string" ? found.question : undefined,
    };
  });

  return {
    originalQuestion: question,
    fields: normalizedFields,
    hypothesis:
      typeof json.hypothesis === "string"
        ? json.hypothesis
        : `Testing whether ${question}`,
  };
}

/**
 * LEARN stage: turn the already-computed backtest numbers into a hedged,
 * plain-English interpretation and 2-3 follow-up ideas. The model never
 * sees raw price data and is never asked to compute anything -- only to
 * interpret numbers it is handed.
 */
export async function explainResults(
  experiment: Experiment,
  result: BacktestResult
): Promise<ExplainResult> {
  const systemPrompt = `You are a careful, honest trading research analyst. You will be given the exact, already-computed results of a historical backtest. Your job is ONLY to interpret these numbers in plain English -- never invent or adjust any number.

Rules:
- Be explicitly hedged. Backtests on limited historical data are weak evidence, not proof.
- If numTrades < 30, or the test period is short, you MUST clearly flag this as insufficient evidence / a real risk of overfitting or noise -- not just a passing caveat.
- Do not give direct financial advice ("you should buy X"). Describe what the data suggests and its limitations.
- Keep the conclusion to 2-4 sentences.
- Propose 2-3 concrete follow-up questions or ideas an analyst could investigate next (e.g. testing a different threshold, a different holding period, out-of-sample data, transaction cost sensitivity).

Respond with ONLY a JSON object of this exact shape:
{
  "conclusion": "...",
  "nextSteps": ["...", "...", "..."],
  "insufficientEvidence": true|false,
  "insufficiencyReason": "..."
}
"insufficiencyReason" is required when insufficientEvidence is true, omit otherwise.`;

  const userPrompt = `Experiment hypothesis: "${experiment.hypothesis}"
Condition: ${experiment.conditionText}
Entry: ${experiment.entryText}
Exit rule: ${experiment.exitRuleText}
Test period: ${experiment.testPeriodStart} to ${experiment.testPeriodEnd}
Costs assumption: ${experiment.costsPct}% round trip

Backtest results (already computed, exact, do not recompute):
- Number of trades: ${result.numTrades}
- Win rate: ${result.winRatePct}%
- Average return per trade (net of costs): ${result.avgReturnPct}%
- Max drawdown across trades: ${result.maxDrawdownPct}%
- Flagged as small sample (<30 trades): ${result.smallSample}
- Flagged as short test period (<1 year): ${result.shortPeriod}`;

  const json = await callGroqJson(systemPrompt, userPrompt);

  return {
    conclusion:
      typeof json.conclusion === "string"
        ? json.conclusion
        : "Unable to generate an interpretation.",
    nextSteps: Array.isArray(json.nextSteps)
      ? (json.nextSteps as string[]).filter((s) => typeof s === "string")
      : [],
    insufficientEvidence:
      typeof json.insufficientEvidence === "boolean"
        ? json.insufficientEvidence
        : result.smallSample || result.shortPeriod,
    insufficiencyReason:
      typeof json.insufficiencyReason === "string"
        ? json.insufficiencyReason
        : undefined,
  };
}
