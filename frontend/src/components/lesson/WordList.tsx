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
      <div className="word-grid">
        {words.map(word => (
          <div key={word.concept_id} className="word-tile">
            <button onClick={() => speak(word.word, voice)} title="Tap to hear" className="word-card">
              <span className="word-card__pic" aria-hidden="true">
                {word.image_url ? <img src={word.image_url} alt="" /> : word.emoji ?? "🐢"}
              </span>
              <span className="word-card__word">{word.word}</span>
              <span className="word-card__tr">{word.translation}</span>
            </button>
            {native && (
              <button
                className="link-btn word-tile__culture"
                onClick={() => setCulture(current => (current === word.concept_id ? null : word.concept_id))}
                aria-pressed={culture === word.concept_id}
              >
                🌍 Culture
              </button>
            )}
          </div>
        ))}
      </div>
      {native && culture !== null && (
        <CulturePanel key={culture} conceptId={culture} learning={learning} native={native} onClose={() => setCulture(null)} />
      )}
    </div>
  );
}
