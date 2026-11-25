import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { saveSentenceResult } from "../lib/progressService";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { WORD_TYPE_LEGEND, wordTypeLabel } from "../lib/wordTypes";

interface Word {
  form:      string;
  word_type: string;
  position:  number;
  uid:       string;
}

interface Recording {
  url:             string;
  author:          string | null;
  license:         string | null;
  attribution_url: string | null;
}

interface Sentence {
  id:          number;
  full_text:   string;
  translation: { es?: string | null; ru?: string | null };
  words:       Word[];
  level:       string;
  audio:       Recording | null;
}

type TransLang = "es" | "ru";

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function SentenceGame() {
  const { user } = useAuth();
  const { speak } = useSpeechSynthesis();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [sentences,   setSentences]   = useState<Sentence[]>([]);
  const [index,       setIndex]       = useState(0);
  const [bank,        setBank]        = useState<Word[]>([]);
  const [slots,       setSlots]       = useState<(Word | null)[]>([]);
  const [dragItem,    setDragItem]    = useState<{ word: Word; from: "bank" | number } | null>(null);
  const [result,      setResult]      = useState<"correct" | "wrong" | null>(null);
  const [showHint,    setShowHint]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [score,       setScore]       = useState({ correct: 0, total: 0 });
  const [transLang,   setTransLang]   = useState<TransLang>("es");
  const dragOver = useRef<"bank" | number | null>(null);

  useEffect(() => {
    fetch("/api/game/sentences")
      .then(r => r.json())
      .then(({ sentences, error: e }: { sentences?: Sentence[]; error?: string }) => {
        if (e) { setError(e); return; }
        if (!sentences?.length) { setError("No sentences found."); return; }
        const shuffled = shuffle(sentences);
        setSentences(shuffled);
        loadSentence(shuffled, 0);
      })
      .catch(() => setError("Cannot reach the server. Is it running?"))
      .finally(() => setLoading(false));
  }, []);

  function loadSentence(list: Sentence[], i: number) {
    const s = list[i];
    if (!s) return;
    const words: Word[] = s.words.map((w, idx) => ({ ...w, uid: `${w.form}-${idx}` }));
    setBank(shuffle(words));
    setSlots(Array(words.length).fill(null));
    setResult(null);
    setShowHint(false);
    setIndex(i);
  }

  function onDragStartBank(word: Word) { setDragItem({ word, from: "bank" }); }
  function onDragStartSlot(word: Word, slotIdx: number) { setDragItem({ word, from: slotIdx }); }

  function onDrop(target: "bank" | number) {
    if (!dragItem) return;
    const newSlots = [...slots];
    const newBank  = [...bank];
    const existing = typeof target === "number" ? newSlots[target] : null;

    if (dragItem.from === "bank") {
      const bi = newBank.findIndex(w => w.uid === dragItem.word.uid);
      if (bi !== -1) newBank.splice(bi, 1);
    } else {
      newSlots[dragItem.from] = null;
    }

    if (typeof target === "number") {
      newSlots[target] = dragItem.word;
      if (existing) newBank.push(existing);
    } else {
      newBank.push(dragItem.word);
    }

    setSlots(newSlots);
    setBank(newBank);
    setDragItem(null);
    dragOver.current = null;
  }

  function checkAnswer() {
    if (slots.some(s => s === null)) return;
    const correct = slots.every((part, idx) => part?.position === idx);
    setResult(correct ? "correct" : "wrong");
    setScore(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    if (user) saveSentenceResult(sentences[index].id, correct).catch(() => {});
  }

  function listen() {
    const s = sentences[index];
    if (!s) return;
    audioRef.current?.pause();
    if (s.audio?.url) {
      const audio = new Audio(s.audio.url);
      audioRef.current = audio;
      audio.play().catch(() => speak(s.full_text, "en-US"));
    } else {
      speak(s.full_text, "en-US");
    }
  }

  function tryAgain() {
    const s = sentences[index];
    if (!s) return;
    const words: Word[] = s.words.map((w, idx) => ({ ...w, uid: `${w.form}-${idx}` }));
    setBank(shuffle(words));
    setSlots(Array(words.length).fill(null));
    setResult(null);
    setShowHint(false);
  }

  function next() {
    const nextIdx = index + 1;
    if (nextIdx < sentences.length) {
      loadSentence(sentences, nextIdx);
    } else {
      const reshuffled = shuffle(sentences);
      setSentences(reshuffled);
      loadSentence(reshuffled, 0);
    }
  }

  const current        = sentences[index];
  const allPlaced      = bank.length === 0;
  const firstWord      = current?.words.find(w => w.position === 0)?.form ?? "";
  const translationText = current?.translation?.[transLang] ?? current?.translation?.es ?? "";

  if (loading) return (
    <div>
    </div>
  );

  if (error) return (
    <div>
      <div>😕</div>
      <div>{error}</div>
    </div>
  );

  return (
    <div>
      <main>

        {/* Header */}
        <div>
          <div>
            <h1>Sentence Builder</h1>
            <p>Translate the sentence into English</p>
          </div>
          <div>
            <div>{score.correct}/{score.total}</div>
            <div>Score</div>
          </div>
        </div>

        {/* Legend */}
        <div>
          {WORD_TYPE_LEGEND.map(l => (
            <div key={l.type} data-word-type={l.type}>
              {l.label}
            </div>
          ))}
        </div>

        {/* Game card */}
        <div>

          {/* Progress bar */}
          <div>
            <progress value={index + 1} max={sentences.length} />
            <span>{index + 1} / {sentences.length}</span>
          </div>

          {/* Sentence to translate */}
          {current && (
            <div>
              <div>
                <p>Translate into English</p>
                <div>
                  {(["es", "ru"] as TransLang[]).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setTransLang(lang)}
                      aria-pressed={transLang === lang}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <p>{translationText || "—"}</p>
            </div>
          )}

          {/* Answer slots */}
          <div>
            <p>Build the sentence</p>
            <div
              onDragOver={e => { e.preventDefault(); dragOver.current = "bank"; }}
              onDrop={() => onDrop("bank")}
            >
              {slots.map((word, idx) => {
                return (
                  <div
                    key={idx}
                    data-word-type={word?.word_type}
                    draggable={!!word}
                    onDragStart={() => word && onDragStartSlot(word, idx)}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); dragOver.current = idx; }}
                    onDrop={e => { e.stopPropagation(); onDrop(idx); }}
                  >
                    {word ? (
                      <>
                        <span>{word.form}</span>
                        <span>{wordTypeLabel(word.word_type)}</span>
                      </>
                    ) : (
                      <span>_</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Word bank */}
          <div>
            <p>Word bank</p>
            <div>
              {bank.length === 0 ? (
                <span>All words placed ✓</span>
              ) : bank.map(word => {
                return (
                  <div
                    key={word.uid}
                    data-word-type={word.word_type}
                    draggable
                    onDragStart={() => onDragStartBank(word)}
                  >
                    <span>{word.form}</span>
                    <span>{wordTypeLabel(word.word_type)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div
            >
              {result === "correct" ? "✅ Correct!" : "❌ Not quite — try again or skip"}
              {result === "correct" && current?.full_text && (
                <span>→ {current.full_text}</span>
              )}
              {result === "correct" && (
                <button onClick={listen}>
                  🔊 Listen
                </button>
              )}
            </div>
          )}

          {result === "correct" && current?.audio && (
            <p>
              Recording by{" "}
              {current.audio.attribution_url
                ? <a href={current.audio.attribution_url} target="_blank" rel="noreferrer">{current.audio.author ?? "unknown"}</a>
                : (current.audio.author ?? "unknown")}
              {current.audio.license ? ` · ${current.audio.license}` : ""} · from Tatoeba
            </p>
          )}

          {/* Hint — reveals only the first word */}
          {showHint && (
            <div>
              💡 The sentence starts with: <span>"{firstWord}"</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div>
          {result === "wrong" ? (
            <>
              <button
                onClick={tryAgain}
              >
                🔄 Try again
              </button>
              <button onClick={next}>
                Skip →
              </button>
            </>
          ) : result === "correct" ? (
            <button
              onClick={next}
            >
              Next →
            </button>
          ) : (
            <>
              <button
                onClick={checkAnswer}
                disabled={!allPlaced}
              >
                Check answer
              </button>
              <button
                onClick={() => setShowHint(h => !h)}
              >
                💡 Hint
              </button>
              <button onClick={next}>
                Skip →
              </button>
            </>
          )}
        </div>

        {/* Dot navigation */}
        <div>
          {sentences.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => loadSentence(sentences, i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Sentence ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
        </div>

      </main>
    </div>
  );
}
