import { useMemo, useState } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonSentence, type Tile } from "../../lib/lessonsApi";
import * as S from "../../css/SentenceGame.styles";
import { Attribution, Feedback, PrimaryButton, SecondaryButton, StepCard, playRecording, shuffle } from "./shared";

interface PlacedTile extends Tile {
  uid: string;
}

function tilesOf(sentence: LessonSentence): PlacedTile[] {
  return sentence.words.map((tile, index) => ({ ...tile, uid: `${sentence.id}-${index}` }));
}

function TileChip({ tile, onClick }: { tile: PlacedTile; onClick: () => void }) {
  const style = S.getTokenStyle(tile.word_type);
  return (
    <button
      onClick={onClick}
      className="rounded-[12px] px-3 py-2 cursor-pointer flex flex-col items-center"
      style={{ border: `2px solid ${style.border}`, background: style.bg }}
    >
      <span className="font-bold text-[15px]" style={{ color: style.text }}>{tile.form}</span>
      {style.label && <span className="text-[9px] opacity-70 font-semibold" style={{ color: style.text }}>{style.label}</span>}
    </button>
  );
}

export default function BuildStep({
  sentences,
  learning,
  onDone,
}: {
  sentences: LessonSentence[];
  learning: string;
  onDone: (correct: number, total: number) => void;
}) {
  const { speak } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";

  const [index, setIndex]     = useState(0);
  const [placed, setPlaced]   = useState<PlacedTile[]>([]);
  const [result, setResult]   = useState<"correct" | "wrong" | null>(null);
  const [score, setScore]     = useState(0);
  const sentence = sentences[index];
  const bankOrder = useMemo(() => shuffle(tilesOf(sentence)), [sentence]);
  const bank = bankOrder.filter(tile => !placed.some(p => p.uid === tile.uid));

  const check = () => {
    const answer = placed.map(t => t.form).join(" ");
    const expected = sentence.words.map(t => t.form).join(" ");
    const correct = answer.toLowerCase() === expected.toLowerCase();
    setResult(correct ? "correct" : "wrong");
    if (correct) setScore(s => s + 1);
  };

  const next = () => {
    if (index + 1 >= sentences.length) {
      onDone(score, sentences.length);
      return;
    }
    setIndex(i => i + 1);
    setPlaced([]);
    setResult(null);
  };

  const listen = () => playRecording(sentence.audio, () => speak(sentence.full_text, voice));

  return (
    <StepCard eyebrow={`Step 3 · Shuffle · ${index + 1} of ${sentences.length}`} title="Build the sentence">
      <div className={S.promptBox}>
        <p className={`${S.promptEyebrow} m-0`}>Translate</p>
        <p className={S.promptText}>{sentence.prompt}</p>
      </div>

      <p className={S.sectionLabel}>Your sentence</p>
      <div className="min-h-[64px] rounded-[16px] p-3 flex flex-wrap gap-2 items-center border-[1.5px] border-dashed border-[var(--border-medium)] mb-5">
        {placed.length === 0 && <span className="text-sm text-[var(--text-tertiary)]">Tap the words below in the right order</span>}
        {placed.map(tile => (
          <TileChip key={tile.uid} tile={tile} onClick={() => result === null && setPlaced(p => p.filter(t => t.uid !== tile.uid))} />
        ))}
      </div>

      <p className={S.sectionLabel}>Words</p>
      <div className="flex flex-wrap gap-2 mb-2 min-h-[48px]">
        {bank.map(tile => (
          <TileChip key={tile.uid} tile={tile} onClick={() => result === null && setPlaced(p => [...p, tile])} />
        ))}
      </div>

      {result && (
        <Feedback correct={result === "correct"}>
          {result === "correct" ? "✅ Correct!" : `❌ The answer is: ${sentence.full_text}`}
        </Feedback>
      )}
      {result && <Attribution recording={sentence.audio} />}

      <div className="flex gap-3 flex-wrap mt-5">
        {result === null ? (
          <>
            <PrimaryButton onClick={check} disabled={bank.length > 0}>Check</PrimaryButton>
            <SecondaryButton onClick={() => setPlaced([])}>Clear</SecondaryButton>
          </>
        ) : (
          <>
            <SecondaryButton onClick={listen}>🔊 Listen</SecondaryButton>
            <PrimaryButton onClick={next}>{index + 1 >= sentences.length ? "Finish building →" : "Next →"}</PrimaryButton>
          </>
        )}
      </div>
    </StepCard>
  );
}
