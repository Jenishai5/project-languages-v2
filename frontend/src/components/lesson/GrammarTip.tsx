import { useState } from "react";
import { checkGrammar, type GrammarCheck } from "../../lib/agentsApi";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: GrammarCheck }
  | { kind: "error"; message: string };

export default function GrammarTip({
  sentenceId,
  answer,
  learning,
  native,
}: {
  sentenceId: number;
  answer: string[];
  learning: string;
  native: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const ask = async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", result: await checkGrammar(sentenceId, answer, learning, native) });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  };

  if (state.kind === "idle") {
    return (
      <button className="btn btn--light grammar-tip__ask" onClick={ask}>
        Why is this wrong?
      </button>
    );
  }

  if (state.kind === "loading") {
    return <p className="grammar-tip grammar-tip--quiet" role="status">The AI teacher is looking at your sentence…</p>;
  }

  if (state.kind === "error") {
    return <p className="grammar-tip grammar-tip--quiet" role="alert">{state.message}</p>;
  }

  const { result } = state;
  if (!result.available) {
    return <p className="grammar-tip grammar-tip--quiet" role="status">{result.message ?? "No explanation this time."}</p>;
  }

  return (
    <aside className="grammar-tip" aria-live="polite">
      <p className="eyebrow">AI teacher</p>
      <p className="grammar-tip__text">{result.explanation}</p>
      {result.mistakes.length > 0 && (
        <ul className="grammar-tip__list">
          {result.mistakes.map((mistake, i) => (
            <li key={i}>
              <s>{mistake.wrong}</s> → <b>{mistake.right}</b>
              {mistake.why && <span className="muted"> · {mistake.why}</span>}
            </li>
          ))}
        </ul>
      )}
      {result.tip && <p className="grammar-tip__hint">💡 {result.tip}</p>}
      <p className="grammar-tip__meta">{result.remaining_today} explanations left today</p>
    </aside>
  );
}
