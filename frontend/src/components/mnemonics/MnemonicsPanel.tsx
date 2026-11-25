import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LangCode, LessonWord } from "../../lib/lessonsApi";
import { fetchMnemonics, saveMnemonic, type Mnemonic } from "../../lib/mnemonicsApi";
import { StepCard } from "../lesson/shared";
import MnemonicCard from "./MnemonicCard";
import SentenceForm from "./SentenceForm";

interface MnemonicsPanelProps {
  words:    LessonWord[];
  learning: LangCode;
  native:   LangCode;
}

export default function MnemonicsPanel({ words, learning, native }: MnemonicsPanelProps) {
  const [saved, setSaved]         = useState<Record<number, Mnemonic>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit]         = useState<number | null>(null);
  const [pictures, setPictures]   = useState(true);
  const [editing, setEditing]     = useState<number | null>(null);
  const [busy, setBusy]           = useState<number | null>(null);
  const [errors, setErrors]       = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    fetchMnemonics(learning, native)
      .then(list => {
        if (cancelled) return;
        setSaved(Object.fromEntries(list.mnemonics.map(m => [m.concept_id, m])));
        setRemaining(list.remaining_today);
        setLimit(list.daily_limit);
        setPictures(list.pictures_enabled);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [learning, native]);

  const submit = async (conceptId: number, sentence: string) => {
    setBusy(conceptId);
    setErrors(prev => ({ ...prev, [conceptId]: "" }));
    try {
      const card = await saveMnemonic(conceptId, learning, native, sentence);
      setSaved(prev => ({ ...prev, [conceptId]: card }));
      setEditing(null);
      if (pictures) setRemaining(r => (r === null ? r : Math.max(0, r - 1)));
    } catch (err) {
      setErrors(prev => ({ ...prev, [conceptId]: err instanceof Error ? err.message : "Something went wrong. Try again." }));
    } finally {
      setBusy(null);
    }
  };

  const noneLeft = pictures && remaining !== null && remaining <= 0;
  const count = Object.keys(saved).length;

  return (
    <StepCard eyebrow="Picture cards" title="Write it, see it, remember it">
      <p className="muted">
        Write your own sentence with each word. The AI turns it into a picture, and the cards become a flashcard game.
        {pictures && limit !== null && remaining !== null && <> You can create <strong>{remaining} of {limit}</strong> more pictures today.</>}
      </p>
      <div className="mnemonic-grid">
        {words.map(word => {
          const card = saved[word.concept_id];
          const showForm = !card || editing === word.concept_id;
          return (
            <MnemonicCard
              key={word.concept_id}
              word={word.word}
              translation={word.translation}
              emoji={card?.emoji ?? word.emoji}
              imageUrl={card?.image_url}
              sentence={showForm ? null : card?.sentence}
            >
              {showForm ? (
                <SentenceForm
                  word={word.word}
                  initial={card?.sentence}
                  busy={busy === word.concept_id}
                  disabled={busy !== null || noneLeft}
                  picturesEnabled={pictures}
                  onSubmit={sentence => submit(word.concept_id, sentence)}
                  onCancel={card ? () => setEditing(null) : undefined}
                />
              ) : (
                <button className="link-btn self-start" onClick={() => setEditing(word.concept_id)}>Rewrite</button>
              )}
              {errors[word.concept_id] && <p className="alert" data-type="error" role="alert">{errors[word.concept_id]}</p>}
            </MnemonicCard>
          );
        })}
      </div>
      {count > 0 && (
        <Link className="btn btn--primary self-start" to="/mnemonics?practice=1">Practise my {count} picture card{count === 1 ? "" : "s"}</Link>
      )}
    </StepCard>
  );
}
