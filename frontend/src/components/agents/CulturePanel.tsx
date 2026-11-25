import { useEffect, useState } from "react";
import { getCultureNote, type CultureNote } from "../../lib/agentsApi";

export default function CulturePanel({
  conceptId,
  learning,
  native,
  onClose,
}: {
  conceptId: number;
  learning: string;
  native: string;
  onClose?: () => void;
}) {
  const [note, setNote]   = useState<CultureNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getCultureNote(conceptId, learning, native)
      .then(found => alive && setNote(found))
      .catch(err => alive && setError(err instanceof Error ? err.message : "Something went wrong."));
    return () => {
      alive = false;
    };
  }, [conceptId, learning, native]);

  const close = onClose && <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>;

  if (error) {
    return <div className="grammar-tip grammar-tip--quiet row row--between" role="alert"><span>{error}</span>{close}</div>;
  }
  if (!note) {
    return <p className="grammar-tip grammar-tip--quiet" role="status">Looking up how native speakers use this word…</p>;
  }
  if (!note.available) {
    return <div className="grammar-tip grammar-tip--quiet row row--between" role="status"><span>{note.message ?? "No culture note this time."}</span>{close}</div>;
  }

  return (
    <aside className="grammar-tip culture-note" aria-live="polite">
      <div className="row row--between">
        <p className="eyebrow">Culture · {note.word}</p>
        {close}
      </div>
      <p className="grammar-tip__text">{note.note}</p>
      {note.expressions.length > 0 && (
        <ul className="word-help__examples">
          {note.expressions.map((expression, i) => (
            <li key={i}>
              <span>“{expression.phrase}”</span>
              <span className="muted">{expression.meaning}</span>
            </li>
          ))}
        </ul>
      )}
      {note.fun_fact && <p className="grammar-tip__hint">🌍 {note.fun_fact}</p>}
      <p className="grammar-tip__meta">{note.remaining_today} AI answers left today</p>
    </aside>
  );
}
