import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonWord } from "../../lib/lessonsApi";

export default function WordList({ words, learning }: { words: LessonWord[]; learning: string }) {
  const { speak } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";

  return (
    <div className="word-grid">
      {words.map(word => (
        <button
          key={word.concept_id}
          onClick={() => speak(word.word, voice)}
          title="Tap to hear"
          className="word-card"
        >
          <span className="word-card__pic" aria-hidden="true">
            {word.image_url ? <img src={word.image_url} alt="" /> : word.emoji ?? "🐢"}
          </span>
          <span className="word-card__word">{word.word}</span>
          <span className="word-card__tr">{word.translation}</span>
        </button>
      ))}
    </div>
  );
}
