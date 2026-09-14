import type { ClarifyField, ClarifyResult, Experiment, ExperimentParams } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates the user-resolved CLARIFY field values before they're turned
 * into an Experiment. Returns one human-readable error per invalid field,
 * or an empty array if everything is usable.
 *
 * WHY this exists as a separate pass rather than just clamping bad input
 * to a default inside buildExperiment: silently falling back (e.g. turning
 * a typo like "a lot" into "2%") would violate the product's own core rule
 * that nothing gets assumed without the user seeing it. If the user typed
 * something the system can't use, that has to surface as an error, not a
 * quiet substitution.
 */
export function validateFieldValues(
  fields: ClarifyField[],
  values: Record<string, string>
): string[] {
  const errors: string[] = [];
  const get = (key: string) => (values[key] ?? "").trim();
  const labelFor = (key: string) =>
    fields.find((f) => f.key === key)?.label ?? key;

  const checkPositiveNumber = (key: keyof ExperimentParams) => {
    const raw = get(key);
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n <= 0) {
      errors.push(`"${labelFor(key)}" must be a positive number (got "${raw}").`);
    }
  };
  const checkNonNegativeNumber = (key: keyof ExperimentParams) => {
    const raw = get(key);
    const n = Number(raw);
    if (raw === "" || !Number.isFinite(n) || n < 0) {
      errors.push(`"${labelFor(key)}" must be a number, 0 or greater (got "${raw}").`);
    }
  };
  const checkDate = (key: keyof ExperimentParams) => {
    const raw = get(key);
    if (!DATE_RE.test(raw) || Number.isNaN(new Date(raw).getTime())) {
      errors.push(`"${labelFor(key)}" must be a date in YYYY-MM-DD format (got "${raw}").`);
    }
  };

  checkPositiveNumber("thresholdPct");
  checkPositiveNumber("lookbackDays");
  checkPositiveNumber("holdingPeriodDays");
  checkNonNegativeNumber("costsPct");
  checkDate("testPeriodStart");
  checkDate("testPeriodEnd");

  if (
    DATE_RE.test(get("testPeriodStart")) &&
    DATE_RE.test(get("testPeriodEnd")) &&
    get("testPeriodStart") >= get("testPeriodEnd")
  ) {
    errors.push(
      `"${labelFor("testPeriodStart")}" must be before "${labelFor("testPeriodEnd")}".`
    );
  }

  const direction = get("direction").toLowerCase();
  if (direction !== "long" && direction !== "short") {
    errors.push(`"${labelFor("direction")}" must be "long" or "short" (got "${get("direction")}").`);
  }
  const moveDirection = get("moveDirection").toLowerCase();
  if (moveDirection !== "fall" && moveDirection !== "rise") {
    errors.push(`"${labelFor("moveDirection")}" must be "fall" or "rise" (got "${get("moveDirection")}").`);
  }

  return errors;
}

/**
 * DEFINE stage logic. Purely client-side: turns the user-resolved field
 * values (whatever the user ended up with after accepting/editing
 * assumptions and answering questions in CLARIFY) into the structured
 * Experiment the backtest engine and the Experiment Card both consume.
 *
 * No network call needed here -- this is just deterministic parsing and
 * string templating, which is why DEFINE doesn't have its own API route.
 *
 * Callers must run validateFieldValues first and block on any errors --
 * this function assumes valid input and only has fallback defaults left
 * as a last-resort safety net, not as the primary way of handling bad input.
 */
export function buildExperiment(
  clarify: ClarifyResult,
  values: Record<string, string>
): Experiment {
  const get = (key: keyof ExperimentParams) => (values[key] ?? "").trim();

  const direction: ExperimentParams["direction"] =
    get("direction").toLowerCase() === "short" ? "short" : "long";
  const moveDirection: ExperimentParams["moveDirection"] =
    get("moveDirection").toLowerCase() === "rise" ? "rise" : "fall";

  const params: ExperimentParams = {
    instrument: get("instrument") || "NIFTY 50",
    direction,
    moveDirection,
    thresholdPct: safeFloat(get("thresholdPct"), 2),
    lookbackDays: safeInt(get("lookbackDays"), 1),
    holdingPeriodDays: safeInt(get("holdingPeriodDays"), 5),
    testPeriodStart: get("testPeriodStart"),
    testPeriodEnd: get("testPeriodEnd"),
    costsPct: safeFloat(get("costsPct"), 0.1),
  };

  const dayWord = (n: number) => (n === 1 ? "day" : "days");

  // CONDITION: the market trigger itself, independent of what you do about
  // it. ENTRY: the trade action taken once that condition fires. Kept as
  // two separate fields (rather than one combined sentence) so the
  // Experiment Card reads as "what happened" vs. "what we did about it."
  const conditionText = `${params.instrument} ${params.moveDirection === "fall" ? "falls" : "rises"} at least ${params.thresholdPct}% over ${params.lookbackDays} trading ${dayWord(params.lookbackDays)}.`;
  const entryText = `${params.direction === "long" ? "Buy (go long)" : "Sell (go short)"} at that day's closing price.`;
  const exitRuleText = `Exit the position after holding for ${params.holdingPeriodDays} trading ${dayWord(params.holdingPeriodDays)}, regardless of price.`;

  return {
    ...params,
    conditionText,
    entryText,
    exitRuleText,
    hypothesis: clarify.hypothesis,
  };
}

function safeFloat(value: string, fallback: number): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
