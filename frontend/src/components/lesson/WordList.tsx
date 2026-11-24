import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonWord } from "../../lib/lessonsApi";

export default function WordList({ words, learning }: { words: LessonWord[]; learning: string }) {
  const { speak } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {words.map(word => (
        <button
          key={word.concept_id}
          onClick={() => speak(word.word, voice)}
          title="Tap to hear"
          className="flex flex-col items-center gap-1 rounded-[16px] border-[1.5px] border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 cursor-pointer"
        >
          {word.image_url ? (
            <img src={word.image_url} alt="" className="w-12 h-12 object-contain rounded-[10px]" />
          ) : (
            <span className="text-[32px] leading-none h-12 flex items-center">{word.emoji ?? "🐢"}</span>
          )}
          <span className="font-extrabold text-[var(--text-primary)]">{word.word}</span>
          <span className="text-xs text-[var(--text-secondary)]">{word.translation}</span>
        </button>
      ))}
    </div>
  );
}
