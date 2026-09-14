# Trading Research Platform

A small prototype (AI Full-Stack Developer Intern take-home) that turns a vague
natural-language trading idea into a structured, testable experiment, runs it
against real historical data, and explains the result honestly — including
saying "this isn't enough evidence" when that's true.

**The user journey — ASK → CLARIFY → DEFINE → TEST → LEARN:**

1. **ASK** — type a vague idea, e.g. *"Does buying NIFTY after a sharp fall work?"*
2. **CLARIFY** — an LLM (Groq) maps the question onto a fixed set of structured
   fields. Every field is labeled **From your question**, **Assumption**, or
   **Needs your input** — nothing is silently invented, and every value is
   editable before you continue.
3. **DEFINE** — the resolved fields are assembled (client-side, no LLM call)
   into a clean "Experiment Card": instrument, entry/exit rule, holding
   period, test period, cost assumptions, and a one-sentence hypothesis.
4. **TEST** — a pure, deterministic TypeScript backtest engine runs the rule
   against a static CSV of daily OHLC data. No LLM is involved in computing
   a single number here.
5. **LEARN** — results are shown in two strictly separate sections: **"What
   the data shows"** (hard numbers, no interpretation) and **"What we can
   reasonably conclude"** (LLM interpretation of those exact numbers, always
   hedged, and explicitly flagged as insufficient evidence when the sample
   is small or the test period is short).

## Why the architecture looks the way it does

The core design decision is a hard wall between **language** and
**arithmetic**:

- [`lib/llm.ts`](lib/llm.ts) — every Groq API call lives here. It turns
  free text into structured fields, writes a plain-English hypothesis, and
  interprets already-computed numbers. It never computes a statistic.
- [`lib/backtest.ts`](lib/backtest.ts) — the backtest engine. A pure
  function, `runBacktest(data, params) => BacktestResult`: no network calls,
  no LLM, no side effects. Same input, same output, every time. This is what
  makes the "hard numbers" trustworthy and unit-testable (see
  [`lib/backtest.test.ts`](lib/backtest.test.ts), run with `npm test`).

If the LLM were ever asked to "estimate" a backtest result, the product
would silently reintroduce the exact made-up-number problem it exists to
prevent. So the LLM only ever sees the backtest engine's *output*, to
explain it — never its *input*.

Other separations follow the same idea:

- [`lib/csv.ts`](lib/csv.ts) — the only file that touches the filesystem
  (loads `data/nifty_daily.csv`). Kept out of `backtest.ts` so the engine
  stays a pure function testable with in-memory arrays.
- [`lib/build-experiment.ts`](lib/build-experiment.ts) — the DEFINE stage.
  Pure string templating / parsing, no network call, which is why DEFINE
  doesn't have its own API route (only CLARIFY, TEST, and LEARN do).
- [`lib/types.ts`](lib/types.ts) — the shared contract (`Experiment`,
  `BacktestResult`, `ClarifyField`, etc.) that every layer imports, so the
  UI, the API routes, and the two logic layers can't drift apart silently.

```
app/
  page.tsx                  # orchestrates the 5-stage flow (client component)
  api/clarify/route.ts      # ASK -> CLARIFY  (calls lib/llm.ts + lib/csv.ts)
  api/backtest/route.ts     # DEFINE -> TEST  (calls lib/backtest.ts + lib/csv.ts, no LLM)
  api/explain/route.ts      # TEST -> LEARN   (calls lib/llm.ts, no computation)
components/
  StageIndicator.tsx        # 5-step progress header
  ClarifyFields.tsx         # CLARIFY stage: editable fields with status badges
  ExperimentCard.tsx        # DEFINE stage: the structured Experiment Card
  ResultsView.tsx           # LEARN stage: data section + conclusion section
lib/
  types.ts                  # shared TypeScript contract
  llm.ts                    # ALL Groq calls (clarify + explain)
  backtest.ts               # pure, deterministic backtest engine
  backtest.test.ts          # unit tests for the engine
  build-experiment.ts       # DEFINE stage: ClarifyResult -> Experiment
  csv.ts                    # loads/parses data/nifty_daily.csv
data/
  nifty_daily.csv           # ~1000 rows of synthetic daily OHLC data
scripts/
  generate-data.mjs         # regenerates the CSV (seeded, reproducible)
```

## The one strategy family this prototype backtests

To keep the LLM's output *machine-executable* (rather than free text the
backtest engine would have to re-parse), CLARIFY maps every question onto
one fixed, parameterized strategy shape: **"react to a sharp N-day move by
entering a trade, then exit after a fixed holding period."** Concretely:

| Field | Meaning |
|---|---|
| `direction` | `long` (buy) or `short` (sell) after the move |
| `moveDirection` | `fall` or `rise` — the triggering move |
| `thresholdPct` | how big the move must be to count as "sharp" |
| `lookbackDays` | move is measured over this many trading days (1 = single-day close-to-close) |
| `holdingPeriodDays` | trading days held before exit |
| `testPeriodStart` / `testPeriodEnd` | date range, clamped to the CSV's coverage |
| `costsPct` | round-trip brokerage + slippage, in percent |

This comfortably covers "buy the dip" / "fade the rally" style questions,
which is the family the example question falls into. A materially
different strategy shape (e.g. moving-average crossovers) would need a
second, separate rule in `lib/backtest.ts` — deliberately not attempted
here to keep the demo honest about scope.

## Key assumptions (all visible/editable in the UI, defaults chosen here)

- **Entry price** = the close of the day the signal fires. The signal itself
  only uses data from that same day and earlier (`lib/backtest.ts` computes
  the move as `close[i] - close[i - lookbackDays]`), so no future
  information is used to decide to enter — see the look-ahead-bias comment
  at the top of `runBacktest`.
- **Exit** = a fixed number of trading days later, at that day's close.
  Not a stop-loss/target exit — kept simple and unambiguous for a
  prototype.
- **Non-overlapping trades**: once a trade is open, no new trade can start
  until it exits. This avoids double-counting the same market move as
  multiple "independent" samples, which would inflate the trade count and
  make the win rate look more statistically meaningful than it is.
- **Costs**: a single round-trip percentage, subtracted directly from each
  trade's raw return (not compounded/modeled per-leg).
- **Max drawdown**: computed by compounding trades sequentially into an
  equity curve (full capital redeployed trade-to-trade) and taking the
  largest peak-to-trough drop. A simplification, since trades don't
  literally have idle capital between them in this model.
- **Insufficient-evidence thresholds**: fewer than 30 trades, or a test
  period under ~1 year, are both flagged explicitly (both in the
  deterministic output and reinforced by the LLM's conclusion).
- **Historical data**: `data/nifty_daily.csv` is synthetic (seeded random
  walk, see `scripts/generate-data.mjs`), not real market data — this
  prototype ships with realistic-looking placeholder data so it works out
  of the box. Swap in a real CSV with the same `date,open,high,low,close`
  columns to use real history.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**, as specified
- **Tailwind CSS v3** for styling (classic `tailwind.config.ts` +
  `postcss.config.js` setup, chosen over Tailwind v4's CSS-first config for
  maximum compatibility with Next 14)
- **Groq API**, model `openai/gpt-oss-120b` — see note below
- **Vitest** for unit-testing the backtest engine
- No database: experiment state lives in React state (`app/page.tsx`) for
  this prototype. In production this would move to Postgres/Supabase, with
  each stage's output persisted so a user could resume or revisit past
  experiments (and so DEFINE/TEST/LEARN could be re-run without re-asking
  CLARIFY).

### Note on the LLM model

The brief asked for `llama-3.3-70b-versatile`. That model has since been
retired from Groq's lineup (confirmed via `GET
https://api.groq.com/openai/v1/models` against the provided key, which
404s for it). `lib/llm.ts` uses `openai/gpt-oss-120b` instead — the closest
currently-available large model with native JSON mode. The model id is a
single constant (`GROQ_MODEL` in `lib/llm.ts`) if you want to swap it.

## How to run locally

```bash
npm install
```

Create `.env.local` (see `.env.local.example`):

```
GROQ_API_KEY=your_groq_api_key_here
```

The historical data CSV is already generated and committed at
`data/nifty_daily.csv`. To regenerate it (deterministic, seeded):

```bash
npm run generate-data
```

Run the dev server:

```bash
npm run dev
```

Open the printed local URL and try the flow — three example questions are
pre-filled as quick-start buttons on the ASK screen.

Other useful commands:

```bash
npm test    # unit tests for the backtest engine (lib/backtest.test.ts)
npm run lint
npm run build
```

## What I'd improve with more time

- **Persistence**: move experiment state to Postgres/Supabase so
  experiments can be saved, listed, and revisited, and so a user's
  CLARIFY answers survive a page refresh.
- **More strategy shapes**: generalize `lib/backtest.ts` beyond the single
  "sharp move -> fixed hold" rule (e.g. moving-average crossovers,
  volatility-filtered entries, trailing stops) behind a small strategy
  registry, with CLARIFY selecting which shape applies.
- **Real market data + multiple instruments**, with a proper data
  provider instead of a static CSV, and instrument selection surfaced in
  CLARIFY instead of being hard-locked to NIFTY 50.
- **Statistical rigor**: real significance testing (e.g. bootstrapped
  confidence intervals on the average return) instead of a fixed
  trade-count threshold for "insufficient evidence."
- **Streaming LLM responses** for CLARIFY/LEARN so the UI doesn't sit on a
  single blocking fetch.
- **Retry/validation loop** around the LLM's JSON output (currently
  defensively normalized/defaulted in `lib/llm.ts`, but a schema-validated
  retry would be more robust than silent fallback for a production system).

## AI tools used

Built with Claude Code (Claude), which scaffolded the app, wrote the
backtest engine, LLM prompts, API routes, UI, tests, and this README, with
review and testing (including live browser testing of the ASK -> LEARN
flow, and the small-sample/short-period warning path) throughout.
