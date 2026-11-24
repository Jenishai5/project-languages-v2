import { useMemo, useState } from "react";
import type { LessonWord } from "../../lib/lessonsApi";
import { PrimaryButton, StepCard, shuffle } from "./shared";

type State = "idle" | "selected" | "correct" | "wrong";

const STYLE: Record<State, string> = {
  idle:     "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]",
  selected: "border-[var(--state-selected-bd)] bg-[var(--state-selected-bg)] text-[var(--state-selected)]",
  correct:  "border-[var(--state-correct-bd)] bg-[var(--state-correct-bg)] text-[var(--state-correct)] opacity-60",
  wrong:    "border-[var(--state-wrong-bd)] bg-[var(--state-wrong-bg)] text-[var(--state-wrong)]",
};

export default function MatchStep({ words, onDone }: { words: LessonWord[]; onDone: (correct: number, total: number) => void }) {
  const answers = useMemo(() => shuffle(words), [words]);
  const [picked, setPicked]   = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong]     = useState<{ left: number; right: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);

  const finished = matched.size === words.length;

  const chooseAnswer = (conceptId: number) => {
    if (picked === null || matched.has(conceptId)) return;
    if (picked === conceptId) {
      setMatched(prev => new Set(prev).add(conceptId));
    } else {
      setMistakes(m => m + 1);
      setWrong({ left: picked, right: conceptId });
      setTimeout(() => setWrong(null), 500);
    }
    setPicked(null);
  };

  const leftState = (id: number): State =>
    matched.has(id) ? "correct" : wrong?.left === id ? "wrong" : picked === id ? "selected" : "idle";
  const rightState = (id: number): State =>
    matched.has(id) ? "correct" : wrong?.right === id ? "wrong" : "idle";

  return (
    <StepCard eyebrow="Step 2 · Match" title="Match each word with its translation">
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="flex flex-col gap-3">
          {words.map(word => (
            <button
              key={word.concept_id}
              disabled={matched.has(word.concept_id)}
              onClick={() => setPicked(word.concept_id)}
              className={`rounded-[14px] border-[1.5px] px-4 py-3 font-bold cursor-pointer ${STYLE[leftState(word.concept_id)]}`}
            >
              {word.word}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {answers.map(word => (
            <button
              key={word.concept_id}
              disabled={matched.has(word.concept_id)}
              onClick={() => chooseAnswer(word.concept_id)}
              className={`rounded-[14px] border-[1.5px] px-4 py-3 font-bold cursor-pointer ${STYLE[rightState(word.concept_id)]}`}
            >
              {word.translation}
            </button>
          ))}
        </div>
      </div>
      {finished && (
        <PrimaryButton onClick={() => onDone(words.length, words.length + mistakes)}>
          {mistakes === 0 ? "Perfect! Next →" : `Done with ${mistakes} mistake${mistakes === 1 ? "" : "s"} · Next →`}
        </PrimaryButton>
      )}
    </StepCard>
  );
}
