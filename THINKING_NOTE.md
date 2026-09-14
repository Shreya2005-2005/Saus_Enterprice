# Thinking Note

**Question:** *"Does buying NIFTY after a sharp fall work?"*

## 1. Interpreting the question

The sentence fixes some things and leaves others open:
- **"buying"** → a long entry. Unambiguous.
- **"NIFTY"** → NIFTY 50 index. Unambiguous.
- **"after"** → a *reactive* strategy: enter once a condition is observed.
- **"a sharp fall"** → ambiguous on three axes at once: how big a move counts as sharp,
  over what window it's measured (one day? three days?), and from what reference point
  (close-to-close? intraday?).
- **"work"** → ambiguous success metric. "Work" implicitly needs an exit rule (you can't
  judge a trade that never closes) and a definition of success — positive average return?
  high win rate? risk-adjusted return? These can disagree on the same data.

Before testing, the system needs: a magnitude + window for "sharp," an entry-price
convention, an exit rule (hence a holding period), a test period, and a cost assumption —
"does it work" ignoring costs is an easier, different question than "does it work in
practice."

## 2. Assumptions — said vs. assumed vs. to-ask

**User actually said:** instrument (NIFTY), direction (buying → long), trigger direction
(a fall, not a rise), strategy shape (reactive entry after a move).

**I assumed** (shown in the UI as an editable "Assumption," never silent):
- Threshold for "sharp": 2% in a single day — a common, defensible reading, not the only one.
- Lookback window: 1 trading day (close-to-close) — simplest reading absent a qualifier.
- Holding period: 5 trading days (~1 week) — a typical short-horizon test, flagged as arbitrary.
- Test period: full available data range, since none was specified.
- Entry price: the close of the trigger day (not next day's open) — see look-ahead note below.
- Exit price: the close N days later, unconditionally — no stop-loss/target, for simplicity.
- Costs: 0.1% round-trip — a rough brokerage + slippage placeholder.

**System should ask** (kept minimal, only where no sane default exists): the threshold
and lookback window most change *which trades even exist*, so those are the two the
system leans toward asking rather than defaulting, when phrasing gives no hint at all.
Anything outside the fixed strategy shape (e.g. "hold until price recovers," a
path-dependent exit) should be surfaced as a question or a "not supported here" message,
not silently approximated.

I deliberately did *not* turn costs into a question — a sane default is uncontroversial,
so it's an editable assumption instead. Not every gap deserves the user's attention.

## 3. Minimum questions, in priority order

1. What size of move counts as "sharp"? (Changes which trades exist at all.)
2. Measured over a single day, or cumulatively over several?
3. How long do you hold before exiting — fixed period, or some other condition?
4. What time period should be tested?

## 4. The experiment definition

| Field | Definition |
|---|---|
| Market / Instrument | NIFTY 50, daily OHLC |
| Condition | Falls ≥ threshold% over the lookback window |
| Entry | Buy (long) at that day's close |
| Exit | Hold exactly N trading days, exit at close, regardless of price path |
| Holding period | N trading days (default assumption: 5) |
| Test period | Date range, clamped to the dataset's actual coverage |
| Relevant filters | **None implemented** — see below |
| Cost assumptions | One round-trip %, subtracted from each trade's raw return |

**On filters:** the brief calls out filters (e.g. volatility) as part of a complete
experiment. I chose not to implement one here. Doing it properly would touch the CLARIFY
schema, the DEFINE UI, and the backtest's signal logic — and I judged getting the core
loop and the look-ahead guarantees right mattered more than feature breadth in the time
available. It's the most deliberate scope cut in the build, and the first thing I'd add
next (likely: "only enter if trailing N-day volatility is above/below X%").

## 5. What could go wrong

- **Ambiguous definitions.** "Sharp fall" has no universal definition — a 2%/1-day
  threshold and a 3%/3-day cumulative decline are both defensible and can select
  different trades entirely. Every such choice is a visible, editable assumption, not a
  baked-in constant.
- **Incorrect assumptions about intent.** A fixed 5-day exit is a guess; if the user
  meant "hold until it recovers," that's a materially different strategy.
- **Data quality.** This prototype uses synthetic, seeded random-walk data (documented in
  the README), not real NIFTY history. Real deployment needs correctly adjusted data
  (splits, dividends).
- **Look-ahead bias.** Guarded explicitly: the signal reads only `close[i-lookback..i]`,
  entry executes at `close[i]` itself, and exit is a fixed number of days forward —
  never a decision that peeks ahead. This is the one property I unit-tested directly,
  including a test that seeds a large future crash on a day structurally unreachable by
  an earlier trade's exit, and asserts that trade is unaffected.
- **Transaction costs & slippage.** Modeled as one flat round-trip %, which likely
  understates real slippage right after sharp declines — exactly when spreads widen most.
- **Overfitting.** Default parameters are reasonable guesses, not results of searching
  the data. A user could still hand-tune them via enough iteration; the system doesn't
  currently warn against that, only against small trade counts.
- **Insufficient evidence.** Explicitly flagged below ~30 trades or under a year of test
  period, with the LLM instructed to state this plainly. The threshold is a judgment
  call, not a rigorous significance test.
- **Regime / drift bias.** NIFTY's long-run upward drift means "buy after a fall" can
  look profitable just from carrying long exposure in a rising market. This prototype
  doesn't correct for that (e.g. no buy-and-hold baseline comparison) — a real limitation.
