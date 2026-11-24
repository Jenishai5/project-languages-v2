import { useState } from "react";
import type { ListeningItem } from "../../lib/lessonsApi";
import { Attribution, Feedback, PrimaryButton, SecondaryButton, StepCard, playRecording } from "./shared";

export default function ListenStep({ items, onDone }: { items: ListeningItem[]; onDone: (correct: number, total: number) => void }) {
  const [index, setIndex]   = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [score, setScore]   = useState(0);
  const item = items[index];

  const pick = (option: string) => {
    if (choice) return;
    setChoice(option);
    if (option === item.answer) setScore(s => s + 1);
  };

  const next = () => {
    if (index + 1 >= items.length) {
      onDone(score, items.length);
      return;
    }
    setIndex(i => i + 1);
    setChoice(null);
  };

  const optionStyle = (option: string) => {
    if (!choice) return "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]";
    if (option === item.answer) return "border-[var(--state-correct-bd)] bg-[var(--state-correct-bg)] text-[var(--state-correct)]";
    if (option === choice) return "border-[var(--state-wrong-bd)] bg-[var(--state-wrong-bg)] text-[var(--state-wrong)]";
    return "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]";
  };

  return (
    <StepCard eyebrow={`Step 4 · Listen · ${index + 1} of ${items.length}`} title="What do you hear?">
      <div className="mb-5">
        <SecondaryButton onClick={() => playRecording(item.audio, () => {})}>▶ Play recording</SecondaryButton>
      </div>
      <div className="flex flex-col gap-3">
        {item.options.map(option => (
          <button
            key={option}
            onClick={() => pick(option)}
            className={`text-left rounded-[14px] border-[1.5px] px-4 py-3 font-semibold cursor-pointer ${optionStyle(option)}`}
          >
            {option}
          </button>
        ))}
      </div>
      {choice && (
        <>
          <Feedback correct={choice === item.answer}>{choice === item.answer ? "✅ Correct!" : "❌ Not this time"}</Feedback>
          <Attribution recording={item.audio} />
          <div className="mt-5">
            <PrimaryButton onClick={next}>{index + 1 >= items.length ? "See results →" : "Next →"}</PrimaryButton>
          </div>
        </>
      )}
    </StepCard>
  );
}
