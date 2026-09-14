import type { Experiment } from "@/lib/types";

/**
 * Renders the DEFINE-stage "Experiment Card". Deliberately a formatted
 * card, not raw JSON -- the brief calls out that the structured experiment
 * must be shown in a clean UI, since the whole point is that a
 * non-technical user should be able to read and sanity-check it.
 */
export default function ExperimentCard({
  experiment,
}: {
  experiment: Experiment;
}) {
  const rows: Array<[string, string]> = [
    ["Market / Instrument", experiment.instrument],
    ["Condition", experiment.conditionText],
    ["Entry", experiment.entryText],
    ["Exit", experiment.exitRuleText],
    [
      "Holding period",
      `${experiment.holdingPeriodDays} trading day${experiment.holdingPeriodDays === 1 ? "" : "s"}`,
    ],
    [
      "Test period",
      `${experiment.testPeriodStart} to ${experiment.testPeriodEnd}`,
    ],
    ["Cost assumptions", `${experiment.costsPct}% round-trip (brokerage + slippage)`],
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="mb-4 rounded-lg bg-neutral-50 p-4 text-sm italic text-neutral-700">
        &ldquo;{experiment.hypothesis}&rdquo;
      </p>
      <dl className="divide-y divide-neutral-100">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-4 py-3 text-sm">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="col-span-2 text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
