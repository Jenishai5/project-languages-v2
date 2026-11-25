import { useMemo, useState } from "react";
import type { LessonWord } from "../../lib/lessonsApi";
import { PrimaryButton, StepCard } from "./shared";
import { shuffle } from "../../lib/lessonUtils";

type State = "idle" | "selected" | "correct" | "wrong";

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
    <StepCard eyebrow="Match" title="Match each word with its translation">
      <div>
        <div>
          {words.map(word => (
            <button
              key={word.concept_id}
              disabled={matched.has(word.concept_id)}
              onClick={() => setPicked(word.concept_id)}
              data-state={leftState(word.concept_id)}
              aria-pressed={picked === word.concept_id}
            >
              {word.word}
            </button>
          ))}
        </div>
        <div>
          {answers.map(word => (
            <button
              key={word.concept_id}
              disabled={matched.has(word.concept_id)}
              onClick={() => chooseAnswer(word.concept_id)}
              data-state={rightState(word.concept_id)}
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
