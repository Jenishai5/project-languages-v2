import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonWord } from "../../lib/lessonsApi";
import { PrimaryButton, StepCard } from "./shared";

export default function LearnStep({ words, learning, onDone }: { words: LessonWord[]; learning: string; onDone: () => void }) {
  const { speak } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";

  return (
    <StepCard eyebrow="Step 1 · Learn" title="New words">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {words.map(word => (
          <button
            key={word.concept_id}
            onClick={() => speak(word.word, voice)}
            className="flex flex-col items-center gap-2 rounded-[18px] border-[1.5px] border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 cursor-pointer"
          >
            {word.image_url ? (
              <img src={word.image_url} alt={word.word} className="w-20 h-20 object-contain rounded-[12px]" />
            ) : (
              <span className="text-[44px] leading-none h-20 flex items-center">{word.emoji ?? "🐢"}</span>
            )}
            <span className="text-lg font-extrabold text-[var(--text-primary)]">{word.word}</span>
            <span className="text-sm text-[var(--text-secondary)]">{word.translation}</span>
            <span className="text-[11px] text-[var(--text-tertiary)]">🔊 tap to hear</span>
          </button>
        ))}
      </div>
      <PrimaryButton onClick={onDone}>I know these words →</PrimaryButton>
    </StepCard>
  );
}
