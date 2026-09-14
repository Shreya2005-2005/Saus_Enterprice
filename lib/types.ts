/**
 * Shared type definitions for the trading research platform.
 *
 * These types are the contract between the LLM layer (lib/llm.ts), the
 * deterministic backtest engine (lib/backtest.ts), the API routes, and the
 * UI. Keeping them in one place makes the ASK -> CLARIFY -> DEFINE -> TEST
 * -> LEARN pipeline easy to trace end to end.
 */

/** One row of daily OHLC price data. */
export interface OhlcRow {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

/** How a single field of the Experiment was resolved during CLARIFY. */
export type ClarifyStatus = "specified" | "assumption" | "question";

/**
 * A single structured parameter of the experiment as produced by the
 * CLARIFY step. Every field the backtest engine needs is represented here
 * so the UI can render a uniform list, regardless of whether the user
 * stated it explicitly, the LLM assumed a default, or the LLM needs to ask
 * about it.
 */
export interface ClarifyField {
  /** Machine key, matches a field on ExperimentParams. */
  key: keyof ExperimentParams;
  /** Human-readable label shown in the UI, e.g. "Holding period". */
  label: string;
  /** How this value was resolved. Drives the UI treatment. */
  status: ClarifyStatus;
  /** Current value, as a string (numbers/dates are serialized). */
  value: string;
  /** Short explanation of why this value was chosen (for assumptions). */
  note?: string;
  /** The clarifying question to show the user, when status === "question". */
  question?: string;
}

/** Full output of the /api/clarify call. */
export interface ClarifyResult {
  originalQuestion: string;
  fields: ClarifyField[];
  /** Draft one-sentence hypothesis, in plain English, from the LLM. */
  hypothesis: string;
}

/**
 * The structured, machine-executable parameters of an experiment. This is
 * intentionally narrow (one strategy family: "react to a sharp N-day move")
 * so that the backtest engine can be a pure, deterministic function with no
 * free-text parsing on its side.
 */
export interface ExperimentParams {
  instrument: string; // e.g. "NIFTY 50"
  direction: "long" | "short"; // buy after the move, or sell after the move
  moveDirection: "fall" | "rise"; // what kind of move triggers entry
  thresholdPct: number; // size of the move that counts as "sharp", e.g. 2.5
  lookbackDays: number; // move is measured over this many trading days
  holdingPeriodDays: number; // exit after this many trading days
  testPeriodStart: string; // YYYY-MM-DD
  testPeriodEnd: string; // YYYY-MM-DD
  costsPct: number; // round-trip brokerage + slippage, in percent
}

/** The full experiment: structured params plus the human-facing framing. */
export interface Experiment extends ExperimentParams {
  conditionText: string; // plain-English market condition/trigger, for display
  entryText: string; // plain-English entry action (what you do about the trigger)
  exitRuleText: string; // plain-English exit rule, for display
  hypothesis: string;
}

/** A single simulated trade produced by the backtest engine. */
export interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number; // net of costs
}

/** Aggregate, purely-computed output of the backtest engine. */
export interface BacktestResult {
  numTrades: number;
  winRatePct: number;
  avgReturnPct: number;
  maxDrawdownPct: number;
  trades: Trade[];
  /** True when numTrades is below the sample-size threshold. */
  smallSample: boolean;
  /** True when the requested test period is under ~1 year of data. */
  shortPeriod: boolean;
}

/** Output of the /api/explain call. */
export interface ExplainResult {
  conclusion: string; // hedged, plain-English interpretation
  nextSteps: string[]; // 2-3 follow-up questions/ideas
  insufficientEvidence: boolean;
  insufficiencyReason?: string;
}
