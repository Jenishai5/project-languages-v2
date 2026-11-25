import { useEffect, useState } from "react";
import { fetchWeakWords, type WeakWord } from "../../lib/agentsApi";
import WordHelpPanel from "./WordHelpPanel";

export default function HardWords({
  learning,
  native,
  lessonId,
  ready,
}: {
  learning: string;
  native: string;
  lessonId?: number;
  ready: Promise<unknown>;
}) {
  const [words, setWords] = useState<WeakWord[] | null>(null);

  useEffect(() => {
    let alive = true;
    ready
      .then(() => fetchWeakWords(learning, native, lessonId))
      .then(found => alive && setWords(found))
      .catch(() => alive && setWords([]));
    return () => {
      alive = false;
    };
  }, [ready, learning, native, lessonId]);

  if (!words || words.length === 0) return null;

  return (
    <section className="hard-words" aria-label="Your hardest words">
      <p className="eyebrow">Your hardest words</p>
      <ul className="hard-words__list">
        {words.map(word => (
          <li key={word.concept_id} className="hard-words__item">
            <div className="row row--between">
              <span>
                {word.emoji && <span aria-hidden="true">{word.emoji} </span>}
                <b>{word.word}</b> <span className="muted">· {word.translation}</span>
              </span>
              <span className="small muted">{word.correct} of {word.attempts} right</span>
            </div>
            <WordHelpPanel conceptId={word.concept_id} learning={learning} native={native} />
          </li>
        ))}
      </ul>
    </section>
  );
}
