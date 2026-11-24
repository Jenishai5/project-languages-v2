import { useState } from "react";
import type { PictureRound } from "../../lib/lessonsApi";
import { Feedback, PrimaryButton, StepCard } from "./shared";

export default function PictureStep({ rounds, onDone }: { rounds: PictureRound[]; onDone: (correct: number, total: number) => void }) {
  const [index, setIndex]   = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [score, setScore]   = useState(0);
  const round = rounds[index];

  const pick = (option: string) => {
    if (choice) return;
    setChoice(option);
    if (option === round.answer) setScore(s => s + 1);
  };

  const next = () => {
    if (index + 1 >= rounds.length) {
      onDone(score, rounds.length);
      return;
    }
    setIndex(i => i + 1);
    setChoice(null);
  };

  const optionStyle = (option: string) => {
    if (!choice) return "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]";
    if (option === round.answer) return "border-[var(--state-correct-bd)] bg-[var(--state-correct-bg)] text-[var(--state-correct)]";
    if (option === choice) return "border-[var(--state-wrong-bd)] bg-[var(--state-wrong-bg)] text-[var(--state-wrong)]";
    return "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]";
  };

  return (
    <StepCard eyebrow={`Step 5 · Picture · ${index + 1} of ${rounds.length}`} title="What is in the picture?">
      <div className="flex justify-center mb-6">
        {round.image_url ? (
          <img src={round.image_url} alt="Guess the word" className="w-40 h-40 object-contain rounded-[18px]" />
        ) : (
          <span role="img" aria-label="Guess the word" className="text-[96px] leading-none">{round.emoji}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {round.options.map(option => (
          <button
            key={option}
            onClick={() => pick(option)}
            className={`rounded-[14px] border-[1.5px] px-4 py-3 font-semibold cursor-pointer ${optionStyle(option)}`}
          >
            {option}
          </button>
        ))}
      </div>
      {choice && (
        <>
          <Feedback correct={choice === round.answer}>
            {choice === round.answer ? "✅ Correct!" : `❌ It's “${round.answer}”`}
          </Feedback>
          <PrimaryButton onClick={next}>{index + 1 >= rounds.length ? "See results →" : "Next →"}</PrimaryButton>
        </>
      )}
    </StepCard>
  );
}
