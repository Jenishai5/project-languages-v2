import { TRAININGS, type Training, type TrainingResult } from "../../lib/trainings";

export default function TrainingMenu({
  available,
  results,
  onOpen,
}: {
  available: Record<Training, boolean>;
  results: Partial<Record<Training, TrainingResult>>;
  onOpen: (training: Training) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {TRAININGS.map(({ id, icon, title, hint }) => {
        const result = results[id];
        const enabled = available[id];
        return (
          <button
            key={id}
            onClick={() => onOpen(id)}
            disabled={!enabled}
            aria-label={title}
            className={`flex flex-col items-center gap-1 rounded-[20px] border-[1.5px] p-6 ${
              result
                ? "border-[var(--state-correct-bd)] bg-[var(--state-correct-bg)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-card)]"
            } ${enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
          >
            <span className="text-[40px] leading-none">{icon}</span>
            <span className="text-lg font-extrabold text-[var(--text-primary)]">{title}</span>
            <span className="text-xs text-[var(--text-secondary)]">
              {!enabled ? "Not ready yet" : !result ? hint : result.total === 0 ? "✓ Skipped" : `✓ ${result.correct} of ${result.total}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
