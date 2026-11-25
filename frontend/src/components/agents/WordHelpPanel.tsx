import { useState } from "react";
import { getWordHelp, type WordHelp } from "../../lib/agentsApi";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; help: WordHelp }
  | { kind: "error"; message: string };

export default function WordHelpPanel({
  conceptId,
  learning,
  native,
  label = "Help me remember",
}: {
  conceptId: number;
  learning: string;
  native: string;
  label?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const ask = async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "done", help: await getWordHelp(conceptId, learning, native) });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  };

  if (state.kind === "idle") {
    return <button className="btn btn--light btn--sm self-start" onClick={ask}>{label}</button>;
  }
  if (state.kind === "loading") {
    return <p className="grammar-tip grammar-tip--quiet" role="status">The AI teacher is preparing examples…</p>;
  }
  if (state.kind === "error") {
    return <p className="grammar-tip grammar-tip--quiet" role="alert">{state.message}</p>;
  }

  const { help } = state;
  if (!help.available) {
    return <p className="grammar-tip grammar-tip--quiet" role="status">{help.message ?? "No help this time."}</p>;
  }

  return (
    <aside className="grammar-tip word-help" aria-live="polite">
      <p className="eyebrow">AI teacher · {help.word}</p>
      {help.examples.length > 0 && (
        <ul className="word-help__examples">
          {help.examples.map((example, i) => (
            <li key={i}>
              <span>{example.sentence}</span>
              <span className="muted">{example.translation}</span>
            </li>
          ))}
        </ul>
      )}
      {(help.synonyms.length > 0 || help.antonyms.length > 0) && (
        <dl className="word-help__words">
          {help.synonyms.length > 0 && (
            <div><dt>Similar</dt><dd>{help.synonyms.join(", ")}</dd></div>
          )}
          {help.antonyms.length > 0 && (
            <div><dt>Opposite</dt><dd>{help.antonyms.join(", ")}</dd></div>
          )}
        </dl>
      )}
      {help.tip && <p className="grammar-tip__hint">💡 {help.tip}</p>}
      <p className="grammar-tip__meta">{help.remaining_today} AI answers left today</p>
    </aside>
  );
}
