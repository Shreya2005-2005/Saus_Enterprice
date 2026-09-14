# AI Usage Note

## 1. Which AI tools did you use?

Claude (Claude Code), as the primary build and thinking partner throughout.

## 2. What did you use them for?

Scaffolding the project; writing the deterministic backtest engine and its unit tests;
writing the CLARIFY/LEARN prompts sent to Groq and the JSON contract between LLM output
and the UI; building the UI for all five stages; live-debugging in a real browser (a
deprecated model, a mobile layout overflow, a corrupted dev cache — each root-caused from
actual logs, not guessed at); and drafting this note and the Thinking Note from the
reasoning already in the code, for me to review and take ownership of.

## 3. Which important decisions did you make yourself?

- Scoping to *one* strategy family (react to a sharp N-day move, fixed holding period) as
  structured, machine-executable parameters, rather than a general strategy DSL.
- Deliberately leaving "filters" out of the experiment definition for this MVP, and
  documenting why rather than half-implementing something broader.
- The insufficient-evidence thresholds (30 trades, 1-year period), enforced in both the
  deterministic output and the LLM's instructed language, so the caveat can't get lost.
- Keeping DEFINE as a pure client-side step with no LLM call, so only 3 API routes exist
  and the "structured numbers vs. language" boundary stays visible in the architecture.
- Non-overlapping trades in the backtest, specifically to avoid inflating the apparent
  sample size with correlated, overlapping signals.
- Splitting the Experiment Card into separate "Condition" and "Entry" rows (what
  happened vs. what we did about it) to match the brief's template exactly.

## 4. Did you reject or modify any AI-generated suggestions? Why?

- The brief specified `llama-3.3-70b-versatile`. When the first live call returned a 404,
  I didn't accept a guessed replacement — I checked the actual `/models` response against
  the provided key, confirmed the model had been retired, and substituted
  `openai/gpt-oss-120b`, named as a single constant and documented in the README.
- CLARIFY's first field-normalization silently left a field blank whenever the LLM
  dropped it. I rejected that as bad UX — it pushed the model's unreliability onto the
  user — and had it fall back to the same sensible defaults the model itself proposes, so
  a dropped field degrades to a labeled assumption, never a blank required input.
- Live testing surfaced a real gap: invalid text in a numeric field (e.g. "a lot" for the
  threshold) silently fell back to a default with no warning, quietly breaking the app's
  own "never invent a parameter silently" rule. Added explicit validation that blocks and
  explains the error instead.

## 5. What part of the solution are you most proud of?

The look-ahead-bias guard in the backtest engine, and specifically that it's *verified*,
not just asserted in a comment: one unit test seeds a large, anomalous future crash on a
day structurally unreachable by an earlier trade's fixed exit index, and asserts that
trade's return is completely unaffected. Given the product's whole premise is
"trustworthy numbers, honestly explained," being able to point at a test that would fail
if that guarantee broke felt like the right way to back the claim up.
