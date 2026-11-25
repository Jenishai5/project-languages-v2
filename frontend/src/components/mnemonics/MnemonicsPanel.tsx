import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { LangCode, LessonWord } from "../../lib/lessonsApi";
import { createMnemonic, fetchMnemonics, type Mnemonic } from "../../lib/mnemonicsApi";
import { StepCard } from "../lesson/shared";
import MnemonicCard from "./MnemonicCard";

interface MnemonicsPanelProps {
  words:    LessonWord[];
  learning: LangCode;
  native:   LangCode;
}

export default function MnemonicsPanel({ words, learning, native }: MnemonicsPanelProps) {
  const [saved, setSaved]         = useState<Record<number, Mnemonic>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit]         = useState<number | null>(null);
  const [busy, setBusy]           = useState<number | null>(null);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMnemonics(learning, native)
      .then(list => {
        if (cancelled) return;
        setSaved(Object.fromEntries(list.mnemonics.map(m => [m.concept_id, m])));
        setRemaining(list.remaining_today);
        setLimit(list.daily_limit);
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [learning, native]);

  const create = async (conceptId: number) => {
    setBusy(conceptId);
    setError(null);
    try {
      const mnemonic = await createMnemonic(conceptId, learning, native);
      setSaved(prev => ({ ...prev, [conceptId]: mnemonic }));
      setRemaining(r => (r === null ? r : Math.max(0, r - 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const noneLeft = remaining !== null && remaining <= 0;

  return (
    <StepCard eyebrow="Mnemonics" title="Memory tricks">
      <p className="muted">
        The AI invents a funny picture story that links how a word sounds to what it means.
        {limit !== null && remaining !== null && <> You can create <strong>{remaining} of {limit}</strong> more today.</>}
      </p>
      {error && <p className="alert" data-type="error" role="alert">{error}</p>}
      <div className="mnemonic-grid">
        {words.map(word => {
          const mnemonic = saved[word.concept_id];
          return (
            <MnemonicCard
              key={word.concept_id}
              word={word.word}
              translation={word.translation}
              emoji={mnemonic?.emoji ?? word.emoji}
              imageUrl={mnemonic?.image_url}
              text={mnemonic?.mnemonic}
            >
              {!mnemonic && (
                <button
                  className="btn btn--secondary btn--sm"
                  onClick={() => create(word.concept_id)}
                  disabled={busy !== null || noneLeft}
                  aria-busy={busy === word.concept_id}
                >
                  {busy === word.concept_id ? "Creating… up to a minute" : "Create memory trick"}
                </button>
              )}
            </MnemonicCard>
          );
        })}
      </div>
      <Link className="link-btn self-start" to="/mnemonics">See all my memory tricks →</Link>
    </StepCard>
  );
}
