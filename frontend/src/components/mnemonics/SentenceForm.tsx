import { useId, useState } from "react";

interface SentenceFormProps {
  word:            string;
  initial?:        string;
  busy:            boolean;
  disabled:        boolean;
  picturesEnabled: boolean;
  onSubmit:        (sentence: string) => void;
  onCancel?:       () => void;
}

export default function SentenceForm({ word, initial = "", busy, disabled, picturesEnabled, onSubmit, onCancel }: SentenceFormProps) {
  const id = useId();
  const [sentence, setSentence] = useState(initial);
  const ready = sentence.trim().length >= 3 && !busy && !disabled;

  return (
    <form
      className="stack stack--tight"
      onSubmit={e => { e.preventDefault(); if (ready) onSubmit(sentence); }}
    >
      <label className="field__label" htmlFor={id}>Write a sentence with “{word}”</label>
      <textarea
        id={id}
        className="textarea"
        rows={2}
        maxLength={200}
        value={sentence}
        onChange={e => setSentence(e.target.value)}
        placeholder={`e.g. The ${word} …`}
      />
      <div className="row row--tight">
        <button type="submit" className="btn btn--secondary btn--sm" disabled={!ready} aria-busy={busy}>
          {busy ? (picturesEnabled ? "Drawing… up to a minute" : "Saving…") : picturesEnabled ? "Create picture" : "Save sentence"}
        </button>
        {onCancel && <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
