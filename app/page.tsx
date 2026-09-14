"use client";

import { useState } from "react";
import StageIndicator, { Stage } from "@/components/StageIndicator";
import ClarifyFields from "@/components/ClarifyFields";
import ExperimentCard from "@/components/ExperimentCard";
import ResultsView from "@/components/ResultsView";
import { buildExperiment, validateFieldValues } from "@/lib/build-experiment";
import type {
  BacktestResult,
  ClarifyResult,
  Experiment,
  ExplainResult,
} from "@/lib/types";

const EXAMPLE_QUESTIONS = [
  "Does buying NIFTY after a sharp fall work?",
  "What happens if I short NIFTY after it rallies hard in a day?",
  "Is there an edge in buying the dip after a 3% drop over 2 days?",
];

export default function Home() {
  const [stage, setStage] = useState<Stage>("ask");

  // ASK
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // CLARIFY
  const [clarifyResult, setClarifyResult] = useState<ClarifyResult | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // DEFINE
  const [experiment, setExperiment] = useState<Experiment | null>(null);

  // TEST
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);

  // LEARN
  const [explaining, setExplaining] = useState(false);
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null);

  async function handleAsk(q: string) {
    if (!q.trim()) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await fetch("/api/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to clarify question.");

      const result = data as ClarifyResult;
      setClarifyResult(result);
      const initialValues: Record<string, string> = {};
      for (const field of result.fields) {
        initialValues[field.key] = field.value ?? "";
      }
      setFieldValues(initialValues);
      setStage("clarify");
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setAsking(false);
    }
  }

  function handleFieldChange(key: string, value: string) {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleContinueToDefine() {
    if (!clarifyResult) return;
    const missing = clarifyResult.fields.filter(
      (f) => !fieldValues[f.key]?.trim()
    );
    if (missing.length > 0) {
      setAskError(
        `Please fill in: ${missing.map((f) => f.label).join(", ")}`
      );
      return;
    }

    const validationErrors = validateFieldValues(clarifyResult.fields, fieldValues);
    if (validationErrors.length > 0) {
      setAskError(validationErrors.join(" "));
      return;
    }

    setAskError(null);
    const exp = buildExperiment(clarifyResult, fieldValues);
    setExperiment(exp);
    setStage("define");
  }

  async function handleRunBacktest() {
    if (!experiment) return;
    setStage("test");
    setTesting(true);
    setTestError(null);
    setBacktestResult(null);
    setExplainResult(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(experiment),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backtest failed.");

      const result = data as BacktestResult;
      setBacktestResult(result);
      setStage("learn");
      fetchExplanation(experiment, result);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("define");
    } finally {
      setTesting(false);
    }
  }

  async function fetchExplanation(exp: Experiment, result: BacktestResult) {
    setExplaining(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment: exp, result }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Explanation failed.");
      setExplainResult(data as ExplainResult);
    } catch (err) {
      setExplainResult({
        conclusion: `Could not generate an interpretation: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        nextSteps: [],
        insufficientEvidence: false,
      });
    } finally {
      setExplaining(false);
    }
  }

  function handleStartOver() {
    setStage("ask");
    setQuestion("");
    setClarifyResult(null);
    setFieldValues({});
    setExperiment(null);
    setBacktestResult(null);
    setExplainResult(null);
    setAskError(null);
    setTestError(null);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">
          Trading Research Platform
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Turn a vague trading idea into a structured, honestly-tested
          experiment.
        </p>
      </header>

      <div className="mb-8">
        <StageIndicator current={stage} />
      </div>

      {stage === "ask" && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="question"
            className="mb-2 block text-sm font-medium text-neutral-700"
          >
            What trading idea do you want to test?
          </label>
          <textarea
            id="question"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Does buying NIFTY after a sharp fall work?"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => setQuestion(eq)}
                className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              >
                {eq}
              </button>
            ))}
          </div>

          {askError && (
            <p className="mt-3 text-sm text-red-600">{askError}</p>
          )}

          <button
            type="button"
            disabled={asking || !question.trim()}
            onClick={() => handleAsk(question)}
            className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {asking ? "Thinking…" : "Analyze this idea"}
          </button>
        </section>
      )}

      {stage === "clarify" && clarifyResult && (
        <section>
          <p className="mb-4 text-sm text-neutral-600">
            Here&apos;s how &ldquo;{clarifyResult.originalQuestion}&rdquo; maps
            onto a testable experiment. Review each field below — edit
            anything that doesn&apos;t look right.
          </p>
          <ClarifyFields
            fields={clarifyResult.fields}
            values={fieldValues}
            onChange={handleFieldChange}
          />
          {askError && (
            <p className="mt-3 text-sm text-red-600">{askError}</p>
          )}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setStage("ask")}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleContinueToDefine}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Build experiment
            </button>
          </div>
        </section>
      )}

      {stage === "define" && experiment && (
        <section>
          <ExperimentCard experiment={experiment} />
          {testError && (
            <p className="mt-3 text-sm text-red-600">{testError}</p>
          )}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => setStage("clarify")}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleRunBacktest}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Run backtest
            </button>
          </div>
        </section>
      )}

      {stage === "test" && (
        <section className="rounded-xl border border-neutral-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-neutral-500">
            {testing
              ? "Running the backtest against historical data…"
              : "Done."}
          </p>
        </section>
      )}

      {stage === "learn" && backtestResult && experiment && (
        <section>
          <ResultsView
            result={backtestResult}
            explanation={explainResult}
            explainLoading={explaining}
          />
          <div className="mt-5">
            <button
              type="button"
              onClick={handleStartOver}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Start a new experiment
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
