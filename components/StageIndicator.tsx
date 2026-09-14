const STAGES = ["Ask", "Clarify", "Define", "Test", "Learn"] as const;

export type Stage = "ask" | "clarify" | "define" | "test" | "learn";

const STAGE_ORDER: Stage[] = ["ask", "clarify", "define", "test", "learn"];

export default function StageIndicator({ current }: { current: Stage }) {
  const currentIdx = STAGE_ORDER.indexOf(current);

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex w-max items-center gap-1.5 text-sm sm:gap-2">
        {STAGES.map((label, idx) => {
          const isDone = idx < currentIdx;
          const isActive = idx === currentIdx;
          return (
            <li key={label} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  isActive
                    ? "bg-neutral-900 text-white"
                    : isDone
                    ? "bg-neutral-300 text-neutral-700"
                    : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {idx + 1}
              </span>
              <span
                className={`whitespace-nowrap ${
                  isActive ? "font-medium text-neutral-900" : "text-neutral-400"
                }`}
              >
                {label}
              </span>
              {idx < STAGES.length - 1 && (
                <span className="mx-1 h-px w-4 shrink-0 bg-neutral-200 sm:w-6" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
