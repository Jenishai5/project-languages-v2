import { useState, useEffect, useCallback } from "react";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { getSpeechLang } from "../utils/getSpeechLang";
import { useAuth } from "../context/AuthContext";
import { saveWordResult } from "../lib/progressService";

type Pair      = { question: string; answer: string };
type ImageMode = "question" | "answer" | null;
type Language  = "en-es" | "en-ru" | "es-ru" | "es-emojis";
type BtnState  = "idle" | "selected" | "correct" | "wrong";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en-es",    label: "English → Spanish" },
  { value: "en-ru",    label: "English → Russian" },
  { value: "es-ru",     label: "Spanish → Russian" },
  { value: "es-emojis", label: "Español → Emojis"  },
];

const TOTAL_PAIRS = 5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchPairs(language: Language): Promise<{ pairs: Pair[]; imageMode: ImageMode }> {
  const res  = await fetch(`/api/game/wordmatch?language=${language}&limit=${TOTAL_PAIRS}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load words");
  return { pairs: data.pairs as Pair[], imageMode: data.imageMode as ImageMode };
}

// ── Image answer card ──────────────────────────────────────────────────────────
function ImageCard({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt="word"
      draggable={false}
    />
  );
}

export default function Game() {
  const { speak } = useSpeechSynthesis();
  const { user }  = useAuth();

  const [language,     setLanguage]     = useState<Language>("en-es");
  const [imageMode,    setImageMode]    = useState<ImageMode>(null);
  const [pairs,        setPairs]        = useState<Pair[]>([]);
  const [answers,      setAnswers]      = useState<Pair[]>([]);
  const [score,        setScore]        = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [selectedQ,    setSelectedQ]    = useState<number | null>(null);
  const [selectedA,    setSelectedA]    = useState<number | null>(null);
  const [qStates,      setQStates]      = useState<BtnState[]>(Array(TOTAL_PAIRS).fill("idle"));
  const [aStates,      setAStates]      = useState<BtnState[]>(Array(TOTAL_PAIRS).fill("idle"));
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const startRound = useCallback(async (lang: Language, resetScore = false) => {
    setLoading(true);
    setError(null);
    try {
      const { pairs: newPairs, imageMode: mode } = await fetchPairs(lang);
      setPairs(newPairs);
      setAnswers(shuffle(newPairs));
      setImageMode(mode);
      setSelectedQ(null);
      setSelectedA(null);
      setMatchedPairs(0);
      setQStates(Array(TOTAL_PAIRS).fill("idle"));
      setAStates(Array(TOTAL_PAIRS).fill("idle"));
      if (resetScore) setScore(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load words");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { startRound(language, true); }, [language, startRound]);

  useEffect(() => {
    if (matchedPairs === TOTAL_PAIRS && TOTAL_PAIRS > 0) {
      const t = setTimeout(() => startRound(language), 1500);
      return () => clearTimeout(t);
    }
  }, [matchedPairs, language, startRound]);

  const questionsAreImages = imageMode === "question";
  const answersAreImages   = imageMode === "answer";

  // ── shared match check ────────────────────────────────────────
  const checkMatch = (qIdx: number, aIdx: number) => {
    if (pairs[qIdx].answer === answers[aIdx].answer) {
      if (!answersAreImages) speak(answers[aIdx].answer, getSpeechLang(language, false));
      setQStates(prev => prev.map((s, idx) => idx === qIdx  ? "correct" : s));
      setAStates(prev => prev.map((s, idx) => idx === aIdx  ? "correct" : s));
      setScore(s => s + 1);
      setMatchedPairs(m => m + 1);
      const lemma = questionsAreImages ? answers[aIdx].answer : pairs[qIdx].question;
      if (user) saveWordResult(lemma, language, true).catch(() => {});
    } else {
      const lemma = questionsAreImages ? pairs[qIdx].question : pairs[qIdx].question;
      if (user) saveWordResult(lemma, language, false).catch(() => {});
      // flash wrong on the second-clicked side
      setQStates(prev => prev.map((s, idx) => idx === qIdx && s !== "correct" ? "wrong" : s));
      setAStates(prev => prev.map((s, idx) => idx === aIdx && s !== "correct" ? "wrong" : s));
      setTimeout(() => {
        setQStates(prev => prev.map((s, idx) => idx === qIdx && s === "wrong" ? "idle" : s));
        setAStates(prev => prev.map((s, idx) => idx === aIdx && s === "wrong" ? "idle" : s));
      }, 500);
    }
    setSelectedQ(null);
    setSelectedA(null);
  };

  const handleQuestion = (i: number) => {
    if (qStates[i] === "correct") return;
    if (!questionsAreImages) speak(pairs[i].question, getSpeechLang(language, true));

    // If an answer is already selected → check match immediately
    if (selectedA !== null) {
      checkMatch(i, selectedA);
      return;
    }
    // Otherwise select this question
    setSelectedQ(i);
    setSelectedA(null);
    setQStates(prev => prev.map((s, idx) => s === "correct" ? s : idx === i ? "selected" : "idle"));
    setAStates(prev => prev.map(s => s === "correct" ? s : "idle"));
  };

  const handleAnswer = (i: number) => {
    if (aStates[i] === "correct") return;
    if (!answersAreImages) speak(answers[i].answer, getSpeechLang(language, false));

    if (selectedQ !== null) {
      checkMatch(selectedQ, i);
      return;
    }
    // Otherwise select this answer
    setSelectedA(i);
    setSelectedQ(null);
    setAStates(prev => prev.map((s, idx) => s === "correct" ? s : idx === i ? "selected" : "idle"));
    setQStates(prev => prev.map(s => s === "correct" ? s : "idle"));
  };

  return (
    <div>

      <header>
        <div>
          <h2>Word Match</h2>
        </div>
        <div>🏆 Score: {score}</div>
        <select
          value={language}
          onChange={e => setLanguage(e.target.value as Language)}
        >
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </header>

      {loading ? (
        <div>
          <p>Loading words…</p>
        </div>
      ) : error ? (
        <div>
          <div>😕</div>
          <p>{error}</p>
          <button onClick={() => startRound(language, true)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div>

            <div>
              {pairs.map((p, i) => (
                <button
                  key={i}
                  onClick={() => handleQuestion(i)}
                  disabled={qStates[i] === "correct"}
                  data-state={qStates[i]}
                >
                  {questionsAreImages
                    ? <ImageCard url={p.question} />
                    : p.question
                  }
                </button>
              ))}
            </div>

            {/* Answers — text or image */}
            <div>
              {answers.map((a, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={aStates[i] === "correct"}
                  data-state={aStates[i]}
                >
                  {answersAreImages
                    ? <ImageCard url={a.answer} />
                    : a.answer
                  }
                </button>
              ))}
            </div>

          </div>

          {matchedPairs === TOTAL_PAIRS && (
            <div>
              <p>🎉 Round complete! Next round loading…</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
