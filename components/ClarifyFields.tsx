import type { ClarifyField } from "@/lib/types";

const STATUS_BADGE: Record<ClarifyField["status"], { label: string; className: string }> = {
  specified: {
    label: "From your question",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  assumption: {
    label: "Assumption",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  question: {
    label: "Needs your input",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
};

/**
 * CLARIFY stage. Renders every structured field the experiment needs.
 * Nothing here is silently invented: "specified" fields show what was
 * read from the question, "assumption" fields show a clearly labeled
 * default the user can edit or accept, and "question" fields prompt the
 * user directly. Every input is editable regardless of status, per the
 * brief's "must be visible and editable" requirement.
 */
export default function ClarifyFields({
  fields,
  values,
  onChange,
}: {
  fields: ClarifyField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const badge = STATUS_BADGE[field.status];
        return (
          <div
            key={field.key}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-neutral-900">
                {field.label}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>

            {field.status === "question" && field.question && (
              <p className="mb-2 text-sm text-neutral-600">{field.question}</p>
            )}
            {field.status === "assumption" && field.note && (
              <p className="mb-2 text-sm text-neutral-500">{field.note}</p>
            )}

            <input
              type="text"
              value={values[field.key] ?? ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={
                field.status === "question" ? "Type your answer…" : undefined
              }
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>
        );
      })}
    </div>
  );
}
