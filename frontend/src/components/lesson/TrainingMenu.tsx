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
    <div className="training-grid">
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
            className="training"
          >
            <span className="training__icon" aria-hidden="true">{icon}</span>
            <span className="training__title">{title}</span>
            <span className="training__hint">
              {!enabled ? "Not ready yet" : !result ? hint : result.total === 0 ? "✓ Skipped" : `✓ ${result.correct} of ${result.total}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
