import { useEffect, useRef, useState } from "react";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";
import { SPEECH_LANG, type LessonWord } from "../../lib/lessonsApi";
import { getRecognition, heardWord, transcriptsOf, type Recognition } from "../../lib/speech";
import { Feedback, PrimaryButton, SecondaryButton, StepCard } from "./shared";
import PronunciationCoach from "../agents/PronunciationCoach";
import { pronunciationSupported } from "../../lib/agentsApi";
import { canRecord } from "../../lib/recordWav";

type Status = "idle" | "listening" | "correct" | "wrong" | "error";

const ERROR_TEXT: Record<string, string> = {
  "not-allowed":   "Please allow the microphone in your browser and try again.",
  "service-not-allowed": "Please allow the microphone in your browser and try again.",
  "no-speech":     "I didn't hear anything. Try again a bit louder.",
  "audio-capture": "No microphone found.",
  "network":       "Speech recognition needs an internet connection.",
};

export default function PronounceStep({
  words,
  learning,
  onDone,
}: {
  words: LessonWord[];
  learning: string;
  onDone: (correct: number, total: number) => void;
}) {
  const { speak } = useSpeechSynthesis();
  const voice = SPEECH_LANG[learning] ?? "en-US";
  const Recognizer = getRecognition();

  const [index, setIndex]     = useState(0);
  const [status, setStatus]   = useState<Status>("idle");
  const [heard, setHeard]     = useState("");
  const [message, setMessage] = useState("");
  const [score, setScore]     = useState(0);
  const recognition = useRef<Recognition | null>(null);
  const scored = useRef(false);
  const [scoring, setScoring] = useState(false);
  const word = words[index];

  useEffect(() => () => recognition.current?.abort(), []);

  useEffect(() => {
    let alive = true;
    if (!canRecord()) return;
    pronunciationSupported(learning)
      .then(supported => alive && setScoring(supported))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [learning]);

  const coach = scoring && <PronunciationCoach key={word.concept_id} word={word.word} learning={learning} />;

  if (!Recognizer) {
    return (
      <StepCard eyebrow="Pronounce" title="Say the words">
        {coach || (
          <p className="muted">
            Your browser can't listen to speech. Open the app in Chrome or Safari to practise pronunciation.
          </p>
        )}
        <PrimaryButton onClick={() => onDone(0, 0)}>Skip this step →</PrimaryButton>
      </StepCard>
    );
  }

  const listen = () => {
    recognition.current?.abort();
    const rec = new Recognizer();
    rec.lang = voice;
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.onresult = event => {
      const transcripts = transcriptsOf(event);
      setHeard(transcripts[0] ?? "");
      if (heardWord(transcripts, word.word, learning)) {
        setStatus("correct");
        if (!scored.current) setScore(s => s + 1);
        scored.current = true;
      } else {
        setStatus("wrong");
      }
    };
    rec.onerror = event => {
      if (event.error === "aborted") return;
      setMessage(ERROR_TEXT[event.error] ?? "Something went wrong. Try again.");
      setStatus("error");
    };
    rec.onend = () => setStatus(current => (current === "listening" ? "idle" : current));
    recognition.current = rec;
    setHeard("");
    setStatus("listening");
    rec.start();
  };

  const next = () => {
    recognition.current?.abort();
    if (index + 1 >= words.length) {
      onDone(score, words.length);
      return;
    }
    scored.current = false;
    setIndex(i => i + 1);
    setStatus("idle");
    setHeard("");
  };

  const finished = status === "correct" || status === "wrong";

  return (
    <StepCard eyebrow={`Pronounce · ${index + 1} of ${words.length}`} title="Say the word out loud">
      <progress value={index + 1} max={words.length} aria-label="Word progress" />
      <div className="pronounce-word">
        <span className="pronounce-word__pic" aria-hidden="true">
          {word.image_url ? <img src={word.image_url} alt="" /> : word.emoji ?? "🐢"}
        </span>
        <span className="pronounce-word__word">{word.word}</span>
        <span className="muted">{word.translation}</span>
      </div>

      <div className="row row--center">
        <SecondaryButton onClick={() => speak(word.word, voice)}>Hear it</SecondaryButton>
        <PrimaryButton onClick={listen} disabled={status === "listening"}>
          {status === "listening" ? "Listening…" : finished ? "Try again" : "Say it"}
        </PrimaryButton>
      </div>

      {status === "correct" && <Feedback correct>✅ Great! I heard “{heard}”.</Feedback>}
      {status === "wrong" && <Feedback correct={false}>❌ I heard “{heard || "…"}”. Listen and try again.</Feedback>}
      {status === "error" && <Feedback correct={false}>{message}</Feedback>}

      {coach}

      <div className="row row--center">
        {status === "correct" ? (
          <PrimaryButton onClick={next}>{index + 1 >= words.length ? "Finish →" : "Next word →"}</PrimaryButton>
        ) : (
          <SecondaryButton onClick={next}>Skip word</SecondaryButton>
        )}
      </div>
    </StepCard>
  );
}
