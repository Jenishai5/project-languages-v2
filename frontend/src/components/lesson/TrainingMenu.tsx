import { useId, type CSSProperties } from "react";
import FeltIcon from "../atoms/FeltIcon";
import { TRAININGS, type Training, type TrainingResult } from "../../lib/trainings";

function status(enabled: boolean, hint: string, result?: TrainingResult): string {
  if (!enabled) return "Not ready yet";
  if (!result) return hint;
  return result.total === 0 ? "✓ Skipped" : `✓ ${result.correct} of ${result.total}`;
}

export default function TrainingMenu({
  available,
  results,
  onOpen,
}: {
  available: Record<Training, boolean>;
  results: Partial<Record<Training, TrainingResult>>;
  onOpen: (training: Training) => void;
}) {
  const id = useId();
  const nextId = TRAININGS.find(t => available[t.id] && !results[t.id])?.id;

  return (
    <ol className="training-path">
      {TRAININGS.map(({ id: training, icon, image, title, hint, minutes, color }, index) => {
        const result = results[training];
        const enabled = available[training];
        const isNext = training === nextId;
        const score = result && result.total > 0 ? Math.round((result.correct / result.total) * 100) : null;
        return (
          <li key={training} className="training-path__item">
            <button
              onClick={() => onOpen(training)}
              disabled={!enabled}
              aria-labelledby={`${id}-${training}-title`}
              aria-describedby={`${id}-${training}-hint`}
              data-state={result ? "done" : "todo"}
              data-next={isNext || undefined}
              data-color={color}
              style={{ "--i": index, "--score": score ?? 0 } as CSSProperties}
              className="training"
            >
              <span className="training__top">
                <span className="training__step" aria-hidden="true">{result ? "✓" : index + 1}</span>
                {isNext && <span className="training__badge">Start here</span>}
              </span>
              <span className="training__icon" aria-hidden="true"><FeltIcon image={image} fallback={icon} /></span>
              <span className="training__title" id={`${id}-${training}-title`}>{title}</span>
              <span className="training__hint" id={`${id}-${training}-hint`}>{status(enabled, hint, result)}</span>
              <span className="training__foot" aria-hidden="true">
                {!enabled ? "Coming soon" : result ? "Play again ↻" : `~${minutes} min →`}
              </span>
              {score !== null && <span className="training__score" aria-hidden="true" />}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
