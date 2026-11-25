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

  const optionState = (option: string) => {
    if (!choice) return "idle";
    if (option === round.answer) return "correct";
    if (option === choice) return "wrong";
    return "muted";
  };

  return (
    <StepCard eyebrow={`Picture · ${index + 1} of ${rounds.length}`} title="What is in the picture?">
      <progress value={index + 1} max={rounds.length} aria-label="Picture progress" />
      <div className="picture-frame">
        {round.image_url ? (
          <img src={round.image_url} alt="Guess the word" />
        ) : (
          <span role="img" aria-label="Guess the word">{round.emoji}</span>
        )}
      </div>
      <div className="choice-grid">
        {round.options.map(option => (
          <button
            key={option}
            onClick={() => pick(option)}
            data-state={optionState(option)}
            className="choice"
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
