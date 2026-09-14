import type { BacktestResult, ExplainResult } from "@/lib/types";

/**
 * LEARN stage. The brief specifically requires the hard numbers and the
 * LLM's interpretation to be visually and structurally separate sections,
 * so a reader can never confuse "what the data proved" with "what the
 * model thinks it might mean". That separation is enforced here by prop
 * shape (BacktestResult vs ExplainResult come from two different API
 * calls) as much as by layout.
 */
export default function ResultsView({
  result,
  explanation,
  explainLoading,
}: {
  result: BacktestResult;
  explanation: ExplainResult | null;
  explainLoading: boolean;
}) {
  const stats: Array<[string, string]> = [
    ["Number of trades", `${result.numTrades}`],
    ["Win rate", `${result.winRatePct}%`],
    ["Average return / trade", `${result.avgReturnPct}%`],
    ["Max drawdown", `${result.maxDrawdownPct}%`],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          What the data shows
        </h3>
        <p className="mb-4 text-xs text-neutral-400">
          Hard numbers only, computed deterministically from the historical
          CSV. No interpretation below this line.
        </p>

        {(result.smallSample || result.shortPeriod) && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {result.smallSample &&
              `Only ${result.numTrades} trades were found (< 30) — `}
            {result.shortPeriod && "the test period is under a year — "}
            this is a small sample. Treat the statistics below as weak
            evidence, not a reliable estimate.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg bg-neutral-50 p-4 text-center"
            >
              <div className="text-2xl font-semibold text-neutral-900">
                {value}
              </div>
              <div className="mt-1 text-xs text-neutral-500">{label}</div>
            </div>
          ))}
        </div>

        {result.trades.length > 0 && (
          <details className="mt-5 text-sm">
            <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800">
              Show all {result.trades.length} trades
            </summary>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-neutral-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">Exit</th>
                    <th className="px-3 py-2 text-right">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-neutral-100 text-neutral-700"
                    >
                      <td className="px-3 py-1.5">{t.entryDate}</td>
                      <td className="px-3 py-1.5">{t.exitDate}</td>
                      <td
                        className={`px-3 py-1.5 text-right font-medium ${
                          t.returnPct >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {t.returnPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          What we can reasonably conclude
        </h3>
        <p className="mb-4 text-xs text-neutral-400">
          LLM-generated interpretation of the numbers above. Hedged, not a
          recommendation.
        </p>

        {explainLoading && (
          <p className="text-sm text-neutral-400">Generating interpretation…</p>
        )}

        {explanation && (
          <>
            {explanation.insufficientEvidence && (
              <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                <span className="font-medium">Insufficient evidence: </span>
                {explanation.insufficiencyReason ??
                  "This sample is too small / short to draw a reliable conclusion."}
              </div>
            )}
            <p className="mb-5 text-sm leading-relaxed text-neutral-800">
              {explanation.conclusion}
            </p>

            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              What to investigate next
            </h4>
            <ul className="list-inside list-disc space-y-1 text-sm text-neutral-700">
              {explanation.nextSteps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
