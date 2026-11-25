import { useEffect, useState } from "react";
import { assessPronunciation, type PronunciationResult } from "../../lib/agentsApi";
import { recordWav } from "../../lib/recordWav";

const RECORD_SECONDS = 3;

type State =
  | { kind: "idle" }
  | { kind: "recording"; left: number }
  | { kind: "scoring" }
  | { kind: "done"; result: PronunciationResult }
  | { kind: "error"; message: string };

function tone(value: number): "good" | "ok" | "weak" {
  return value >= 80 ? "good" : value >= 60 ? "ok" : "weak";
}

export default function PronunciationCoach({ word, learning }: { word: string; learning: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (state.kind !== "recording" || state.left <= 0) return;
    const timer = window.setTimeout(() => setState({ kind: "recording", left: state.left - 1 }), 1000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const start = async () => {
    setState({ kind: "recording", left: RECORD_SECONDS });
    try {
      const audio = await recordWav(RECORD_SECONDS * 1000);
      setState({ kind: "scoring" });
      setState({ kind: "done", result: await assessPronunciation(learning, word, audio) });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setState({
        kind: "error",
        message: denied ? "Please allow the microphone in your browser and try again." : error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  };

  const button = (
    <button className="btn btn--light self-center" onClick={start} disabled={state.kind === "recording" || state.kind === "scoring"}>
      {state.kind === "recording"
        ? `🔴 Recording… say “${word}” (${state.left})`
        : state.kind === "scoring"
          ? "Scoring…"
          : state.kind === "done"
            ? "🎯 Score again"
            : "🎯 Score my pronunciation"}
    </button>
  );

  if (state.kind !== "done") {
    return (
      <div className="stack">
        {button}
        {state.kind === "error" && <p className="grammar-tip grammar-tip--quiet" role="alert">{state.message}</p>}
      </div>
    );
  }

  const { result } = state;
  if (!result.available || !result.heard || result.pronunciation === null) {
    return (
      <div className="stack">
        {button}
        <p className="grammar-tip grammar-tip--quiet" role="status">{result.message ?? "No score this time."}</p>
      </div>
    );
  }

  const bars: [string, number | null][] = [["Accuracy", result.accuracy], ["Fluency", result.fluency], ["Completeness", result.completeness]];

  return (
    <div className="stack">
      {button}
      <aside className="grammar-tip pron-score" aria-live="polite">
        <div className="pron-score__top">
          <span className="pron-score__big" data-tone={tone(result.pronunciation)}>{Math.round(result.pronunciation)}</span>
          <div>
            <p className="eyebrow">Pronunciation score</p>
            <p className="grammar-tip__text">{result.verdict}</p>
          </div>
        </div>
        <dl className="pron-score__bars">
          {bars.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd><meter min={0} max={100} value={value ?? 0} aria-label={label} /> {Math.round(value ?? 0)}</dd>
            </div>
          ))}
        </dl>
        <p className="pron-score__words">
          {result.words.map((w, i) => (
            <span key={i} data-tone={tone(w.accuracy)} title={`${Math.round(w.accuracy)} / 100`}>{w.word} </span>
          ))}
        </p>
        {result.weak_sounds.length > 0 && (
          <p className="grammar-tip__hint">Practise the sound{result.weak_sounds.length > 1 ? "s" : ""} {result.weak_sounds.map(s => `/${s}/`).join(", ")}.</p>
        )}
        <p className="grammar-tip__meta">Scored by Azure Speech · {result.remaining_today} AI answers left today</p>
      </aside>
    </div>
  );
}
