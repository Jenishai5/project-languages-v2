import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { LangCode, LessonWord } from "../../lib/lessonsApi";
import { attemptFor, type PendingSave } from "../../lib/idempotency";
import { fetchMnemonics, saveMnemonic, type Mnemonic } from "../../lib/mnemonicsApi";
import { StepCard } from "../lesson/shared";
import MnemonicCard from "./MnemonicCard";
import SentenceForm from "./SentenceForm";

const PEEK_RIGHT = 3;
const ADVANCE_AFTER_MS = 2500;

interface MnemonicsPanelProps {
  words:    LessonWord[];
  learning: LangCode;
  native:   LangCode;
}

function slotOf(index: number, total: number): number {
  if (index === 0) return 0;
  if (index <= PEEK_RIGHT) return index;
  if (index === total - 1 && total > PEEK_RIGHT + 1) return -1;
  return PEEK_RIGHT + 1;
}

export default function MnemonicsPanel({ words, learning, native }: MnemonicsPanelProps) {
  const [saved, setSaved]         = useState<Record<number, Mnemonic>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit]         = useState<number | null>(null);
  const [pictures, setPictures]   = useState(true);
  const [editing, setEditing]     = useState<number | null>(null);
  const [busy, setBusy]           = useState<number | null>(null);
  const [errors, setErrors]       = useState<Record<number, string>>({});
  const [order, setOrder]         = useState<number[]>(() => words.map(w => w.concept_id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaves = useRef(new Map<number, PendingSave>());

  useEffect(() => {
    let cancelled = false;
    fetchMnemonics(learning, native)
      .then(list => {
        if (cancelled) return;
        const byConcept = Object.fromEntries(list.mnemonics.map(m => [m.concept_id, m]));
        setSaved(byConcept);
        setRemaining(list.remaining_today);
        setLimit(list.daily_limit);
        setPictures(list.pictures_enabled);
        setOrder(words.map(w => w.concept_id).sort((a, b) => Number(a in byConcept) - Number(b in byConcept)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [learning, native, words]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const bringToFront = (conceptId: number) => {
    if (timer.current) clearTimeout(timer.current);
    setEditing(null);
    setOrder(prev => {
      const at = prev.indexOf(conceptId);
      return at <= 0 ? prev : [...prev.slice(at), ...prev.slice(0, at)];
    });
  };
  const next = () => order.length > 1 && bringToFront(order[1]);
  const previous = () => order.length > 1 && bringToFront(order[order.length - 1]);

  const submit = async (conceptId: number, sentence: string) => {
    setBusy(conceptId);
    setErrors(prev => ({ ...prev, [conceptId]: "" }));
    const attempt = attemptFor(pendingSaves.current.get(conceptId), sentence);
    pendingSaves.current.set(conceptId, attempt);
    try {
      const { card, replayed } = await saveMnemonic(conceptId, learning, native, sentence, attempt.key);
      pendingSaves.current.delete(conceptId);
      setSaved(prev => ({ ...prev, [conceptId]: card }));
      setEditing(null);
      if (pictures && !replayed) setRemaining(r => (r === null ? r : Math.max(0, r - 1)));
      timer.current = setTimeout(() => {
        setOrder(prev => (prev[0] === conceptId ? [...prev.slice(1), conceptId] : prev));
      }, ADVANCE_AFTER_MS);
    } catch (err) {
      setErrors(prev => ({ ...prev, [conceptId]: err instanceof Error ? err.message : "Something went wrong. Try again." }));
    } finally {
      setBusy(null);
    }
  };

  const noneLeft = pictures && remaining !== null && remaining <= 0;
  const count = Object.keys(saved).length;
  const wordById = new Map(words.map(w => [w.concept_id, w]));
  const active = wordById.get(order[0]);

  return (
    <StepCard eyebrow="Picture cards" title="Write it, see it, remember it">
      <p className="muted">
        Write your own sentence with each word. The AI turns it into a picture, and the cards become a flashcard game.
        {pictures && limit !== null && remaining !== null && <> You can create <strong>{remaining} of {limit}</strong> more pictures today.</>}
      </p>

      <div className="mnemonic-deck" aria-roledescription="carousel" aria-label="Picture cards">
        {words.map(word => {
          const index = order.indexOf(word.concept_id);
          const slot = slotOf(index, order.length);
          const isActive = slot === 0;
          const card = saved[word.concept_id];
          const showForm = !card || editing === word.concept_id;
          return (
            <div
              key={word.concept_id}
              className="mnemonic-deck__slot"
              data-slot={slot}
              data-done={card && !showForm ? "true" : undefined}
              style={{ "--slot": slot } as CSSProperties}
              inert={!isActive}
              aria-hidden={!isActive}
              onClick={isActive ? undefined : () => bringToFront(word.concept_id)}
            >
              {slot <= PEEK_RIGHT && (
                <MnemonicCard
                  word={word.word}
                  translation={word.translation}
                  emoji={card?.emoji ?? word.emoji}
                  imageUrl={card?.image_url}
                  sentence={showForm ? null : card?.sentence}
                >
                  {isActive && (showForm ? (
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
                  ))}
                  {isActive && errors[word.concept_id] && <p className="alert" data-type="error" role="alert">{errors[word.concept_id]}</p>}
                </MnemonicCard>
              )}
            </div>
          );
        })}
      </div>

      <div className="mnemonic-deck__nav">
        <button className="btn btn--ghost btn--sm" onClick={previous} disabled={order.length < 2} aria-label="Previous word">←</button>
        <span className="small" aria-live="polite">
          {active ? <><strong>{active.word}</strong> · {count} of {words.length} written</> : null}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={next} disabled={order.length < 2} aria-label="Next word">→</button>
      </div>

      {count > 0 && (
        <Link className="btn btn--primary self-start" to="/mnemonics?practice=1">Practise my {count} picture card{count === 1 ? "" : "s"}</Link>
      )}
    </StepCard>
  );
}
