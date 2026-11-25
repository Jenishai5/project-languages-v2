import { useEffect, useMemo, useRef, useState } from "react";
import { shuffle } from "../../lib/lessonUtils";
import { SPEECH_LANG, type LangCode } from "../../lib/lessonsApi";
import type { Mnemonic } from "../../lib/mnemonicsApi";
import { getRecognition, heardWord, transcriptsOf, typedAnswerMatches, type Recognition } from "../../lib/speech";

type Mode = "say" | "type";
type Result = "correct" | "wrong" | null;

interface FlashcardsProps {
  cards:    Mnemonic[];
  learning: LangCode;
  onExit:   () => void;
}

export default function Flashcards({ cards, learning, onExit }: FlashcardsProps) {
  const deck = useMemo(() => shuffle(cards), [cards]);
  const Recognizer = getRecognition();

  const [index, setIndex]     = useState(0);
  const [mode, setMode]       = useState<Mode>(Recognizer ? "say" : "type");
  const [typed, setTyped]     = useState("");
  const [heard, setHeard]     = useState("");
  const [listening, setListening] = useState(false);
  const [result, setResult]   = useState<Result>(null);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore]     = useState(0);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => recognition.current?.abort(), []);

  const card = deck[index];
  const done = index >= deck.length;

  const answer = (correct: boolean) => {
    setResult(correct ? "correct" : "wrong");
    if (correct) setScore(s => s + 1);
    setFlipped(true);
  };

  const listen = () => {
    if (!Recognizer) return;
    recognition.current?.abort();
    const rec = new Recognizer();
    rec.lang = SPEECH_LANG[learning] ?? "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.onresult = event => {
      const transcripts = transcriptsOf(event);
      setHeard(transcripts[0] ?? "");
      answer(heardWord(transcripts, card.word, learning));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognition.current = rec;
    setHeard("");
    setListening(true);
    rec.start();
  };

  const next = () => {
    recognition.current?.abort();
    setIndex(i => i + 1);
    setTyped("");
    setHeard("");
    setResult(null);
    setFlipped(false);
  };

  if (done) {
    return (
      <section className="card step-card text-center">
        <p className="eyebrow">Practice finished</p>
        <h2 className="h1">{score} of {deck.length}</h2>
        <p className="muted">words remembered from your own pictures.</p>
        <div className="row row--center">
          <button className="btn btn--primary" onClick={() => { setIndex(0); setScore(0); }}>Play again</button>
          <button className="btn btn--secondary" onClick={onExit}>Back to my cards</button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack stack--loose" aria-live="polite">
      <div className="row row--between">
        <p className="eyebrow">Card {index + 1} of {deck.length} · {score} right</p>
        <button className="btn btn--ghost btn--sm" onClick={onExit}>Stop</button>
      </div>
      <progress value={index + 1} max={deck.length} aria-label="Cards" />

      <div className="flashcard" data-flipped={flipped}>
        <div className="flashcard__inner">
          <div className="flashcard__face flashcard__front" aria-hidden={flipped}>
            <div className="flashcard__pic">
              {card.image_url ? <img src={card.image_url} alt="Your picture" /> : <span aria-hidden="true">{card.emoji ?? "🐢"}</span>}
            </div>
            <p className="flashcard__sentence">{card.masked_sentence}</p>
          </div>
          <div className="flashcard__face flashcard__back" aria-hidden={!flipped}>
            <p className="eyebrow">{result === "correct" ? "Correct!" : result === "wrong" ? "The answer is" : "Answer"}</p>
            <p className="flashcard__word">{card.word}</p>
            <p className="muted">{card.translation}</p>
            <p className="flashcard__sentence">“{card.sentence}”</p>
            {heard && <p className="small muted">I heard “{heard}”.</p>}
          </div>
        </div>
      </div>

      {!flipped ? (
        <div className="stack">
          {Recognizer && (
            <div className="segmented" role="group" aria-label="How to answer">
              <button type="button" aria-pressed={mode === "say"} onClick={() => setMode("say")}>Say it</button>
              <button type="button" aria-pressed={mode === "type"} onClick={() => setMode("type")}>Type it</button>
            </div>
          )}
          {mode === "say" ? (
            <div className="row row--center">
              <button className="btn btn--primary btn--lg" onClick={listen} disabled={listening}>
                {listening ? "Listening…" : "Say the missing word"}
              </button>
            </div>
          ) : (
            <form className="row" onSubmit={e => { e.preventDefault(); answer(typedAnswerMatches(typed, card.word, learning)); }}>
              <label className="visually-hidden" htmlFor="flash-answer">Missing word</label>
              <input
                id="flash-answer"
                className="input grow"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder="Type the missing word"
                autoComplete="off"
                autoFocus
              />
              <button type="submit" className="btn btn--primary" disabled={!typed.trim()}>Check</button>
            </form>
          )}
          <button className="link-btn self-start" onClick={() => setFlipped(true)}>Flip the card</button>
        </div>
      ) : (
        <div className="row">
          {result && <p className="feedback grow" data-state={result} role="status">{result === "correct" ? "Well done!" : "Not quite. Look at the back."}</p>}
          <button className="btn btn--primary" onClick={next}>{index + 1 >= deck.length ? "See results" : "Next card"}</button>
        </div>
      )}
    </section>
  );
}
