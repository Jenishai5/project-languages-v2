import { useState } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonWord } from "../../lib/lessonsApi";
import CulturePanel from "../agents/CulturePanel";

export default function WordList({ words, learning, native }: { words: LessonWord[]; learning: string; native?: string }) {
  const { speak } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";
  const [culture, setCulture] = useState<number | null>(null);

  return (
    <div className="stack">
      <ul className="word-list">
        {words.map(word => (
          <li key={word.concept_id} className="word-row">
            <button onClick={() => speak(word.word, voice)} className="word-row__main" aria-label={`Hear ${word.word}`}>
              <span className="word-row__sound" aria-hidden="true">🔊</span>
              <span className="word-row__word">{word.word}</span>
              <span className="word-row__tr">{word.translation}</span>
            </button>
            {native && (
              <button
                className="link-btn word-row__culture"
                onClick={() => setCulture(current => (current === word.concept_id ? null : word.concept_id))}
                aria-pressed={culture === word.concept_id}
              >
                🌍 Culture
              </button>
            )}
          </li>
        ))}
      </ul>
      {native && culture !== null && (
        <CulturePanel key={culture} conceptId={culture} learning={learning} native={native} onClose={() => setCulture(null)} />
      )}
    </div>
  );
}
