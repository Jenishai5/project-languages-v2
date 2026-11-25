import { useMemo, useState } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonSentence, type Tile } from "../../lib/lessonsApi";
import { wordTypeLabel } from "../../lib/wordTypes";
import { Attribution, Feedback, PrimaryButton, SecondaryButton, StepCard } from "./shared";
import { playRecording, shuffle } from "../../lib/lessonUtils";

interface PlacedTile extends Tile {
  uid: string;
}

function tilesOf(sentence: LessonSentence): PlacedTile[] {
  return sentence.words.map((tile, index) => ({ ...tile, uid: `${sentence.id}-${index}` }));
}

function TileChip({ tile, onClick }: { tile: PlacedTile; onClick: () => void }) {
  return (
    <button onClick={onClick} data-word-type={tile.word_type}>
      <span>{tile.form}</span>
      <span>{wordTypeLabel(tile.word_type)}</span>
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
    <StepCard eyebrow={`Shuffle · ${index + 1} of ${sentences.length}`} title="Build the sentence">
      <div>
        <p>Translate</p>
        <p>{sentence.prompt}</p>
      </div>

      <p>Your sentence</p>
      <div>
        {placed.length === 0 && <span>Tap the words below in the right order</span>}
        {placed.map(tile => (
          <TileChip key={tile.uid} tile={tile} onClick={() => result === null && setPlaced(p => p.filter(t => t.uid !== tile.uid))} />
        ))}
      </div>

      <p>Words</p>
      <div>
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

      <div>
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
