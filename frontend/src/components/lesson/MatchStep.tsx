import { useMemo, useRef, useState } from "react";
import type { LessonWord } from "../../lib/lessonsApi";
import { PrimaryButton, StepCard } from "./shared";
import { shuffle } from "../../lib/lessonUtils";
import { saveLessonWordResult } from "../../lib/progressService";
import HardWords from "../agents/HardWords";

type State = "idle" | "selected" | "correct" | "wrong";

export default function MatchStep({
  words,
  onDone,
  learning,
  native,
  lessonId,
}: {
  words: LessonWord[];
  onDone: (correct: number, total: number) => void;
  learning?: string;
  native?: string;
  lessonId?: number;
}) {
  const answers = useMemo(() => shuffle(words), [words]);
  const [picked, setPicked]   = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrong, setWrong]     = useState<{ left: number; right: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const saves = useRef<Promise<void>[]>([]);

  const finished = matched.size === words.length;
  const [saved, setSaved] = useState<Promise<unknown> | null>(null);

  const remember = (conceptId: number, correct: boolean) => {
    if (!learning) return;
    saves.current.push(saveLessonWordResult(conceptId, learning, correct).catch(() => {}));
  };

  const chooseAnswer = (conceptId: number) => {
    if (picked === null || matched.has(conceptId)) return;
    if (picked === conceptId) {
      remember(conceptId, true);
      const next = new Set(matched).add(conceptId);
      setMatched(next);
      if (next.size === words.length) setSaved(Promise.allSettled(saves.current));
    } else {
      remember(picked, false);
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
      <div className="match-grid">
        <div>
          {words.map(word => (
            <button
              key={word.concept_id}
              disabled={matched.has(word.concept_id)}
              onClick={() => setPicked(word.concept_id)}
              data-state={leftState(word.concept_id)}
              aria-pressed={picked === word.concept_id}
              className="choice"
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
              className="choice"
            >
              {word.translation}
            </button>
          ))}
        </div>
      </div>
      {finished && mistakes > 0 && learning && native && saved && (
        <HardWords learning={learning} native={native} lessonId={lessonId} ready={saved} />
      )}
      {finished && (
        <PrimaryButton onClick={() => onDone(words.length, words.length + mistakes)}>
          {mistakes === 0 ? "Perfect! Next →" : `Done with ${mistakes} mistake${mistakes === 1 ? "" : "s"} · Next →`}
        </PrimaryButton>
      )}
    </StepCard>
  );
}
