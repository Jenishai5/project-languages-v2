import type { ReactNode } from "react";

interface MnemonicCardProps {
  word:        string;
  translation: string;
  emoji:       string | null;
  imageUrl?:   string | null;
  sentence?:   string | null;
  children?:   ReactNode;
}

export default function MnemonicCard({ word, translation, emoji, imageUrl, sentence, children }: MnemonicCardProps) {
  return (
    <article className="mnemonic-card">
      <div className="mnemonic-card__pic">
        {imageUrl ? (
          <img src={imageUrl} alt={sentence ? `Picture of: ${sentence}` : `Picture for ${word}`} loading="lazy" />
        ) : (
          <span aria-hidden="true">{emoji ?? "🐢"}</span>
        )}
      </div>
      <div className="mnemonic-card__body">
        <h3 className="mnemonic-card__word">{word}</h3>
        <p className="small muted">{translation}</p>
        {sentence && <p className="mnemonic-card__text">“{sentence}”</p>}
        {children}
      </div>
    </article>
  );
}
