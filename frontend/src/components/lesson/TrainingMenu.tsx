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
    <div>
      {TRAININGS.map(({ id, icon, title, hint }) => {
        const result = results[id];
        const enabled = available[id];
        return (
          <button
            key={id}
            onClick={() => onOpen(id)}
            disabled={!enabled}
            aria-label={title}
            data-state={result ? "done" : "todo"}
          >
            <span>{icon}</span>
            <span>{title}</span>
            <span>
              {!enabled ? "Not ready yet" : !result ? hint : result.total === 0 ? "✓ Skipped" : `✓ ${result.correct} of ${result.total}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
