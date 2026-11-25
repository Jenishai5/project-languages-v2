import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ConversationPanel from "../components/agents/ConversationPanel";
import Flashcards from "../components/mnemonics/Flashcards";
import MnemonicCard from "../components/mnemonics/MnemonicCard";
import { useLanguages } from "../hooks/useLanguages";
import { fetchMnemonics, type Mnemonic, type MnemonicList } from "../lib/mnemonicsApi";

export default function Mnemonics() {
  const { settings } = useLanguages();
  const [params, setParams] = useSearchParams();
  const practising = params.get("practice") === "1";
  const [loaded, setLoaded] = useState<{ key: string; list: MnemonicList | null; error: string | null }>({ key: "", list: null, error: null });
  const key = `${settings.learning_lang}:${settings.native_lang}`;
  const list  = loaded.key === key ? loaded.list : null;
  const error = loaded.key === key ? loaded.error : null;

  useEffect(() => {
    let cancelled = false;
    fetchMnemonics(settings.learning_lang, settings.native_lang)
      .then(data => { if (!cancelled) setLoaded({ key, list: data, error: null }); })
      .catch(err => { if (!cancelled) setLoaded({ key, list: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [key, settings.learning_lang, settings.native_lang]);

  const [talking, setTalking] = useState<Mnemonic | null>(null);
  const cards = list?.mnemonics ?? [];
  const setPractice = (on: boolean) => setParams(on ? { practice: "1" } : {});

  return (
    <>
      <header className="page-header grid-bg">
        <div className="container page-header__inner">
          <p className="eyebrow">Picture cards</p>
          <h1 className="display">My picture <em>cards</em></h1>
          <p className="lead">Your own sentences, drawn by AI. Guess the missing word, then flip the card.</p>
        </div>
      </header>

      <div className="container page-body">
        {error && <p className="alert" data-type="error" role="alert">{error}</p>}
        {!list && !error && <div className="spinner" role="status" aria-label="Loading picture cards" />}

        {list && cards.length === 0 && (
          <div className="center-state">
            <p className="h3">No picture cards yet.</p>
            <p className="muted">Open a lesson and write a sentence with any word.</p>
            <Link className="btn btn--primary" to="/lessons">Go to lessons</Link>
          </div>
        )}

        {list && cards.length > 0 && practising && (
          <Flashcards cards={cards} learning={settings.learning_lang} native={settings.native_lang} onExit={() => setPractice(false)} />
        )}

        {talking && (
          <ConversationPanel
            key={talking.id}
            card={talking}
            learning={settings.learning_lang}
            native={settings.native_lang}
            onClose={() => setTalking(null)}
          />
        )}

        {list && cards.length > 0 && !practising && !talking && (
          <>
            <div className="row row--between">
              <p className="eyebrow">
                {cards.length} card{cards.length === 1 ? "" : "s"}
                {list.pictures_enabled && <> · {list.remaining_today} of {list.daily_limit} pictures left today</>}
              </p>
              <button className="btn btn--primary" onClick={() => setPractice(true)}>Practise with flashcards</button>
            </div>
            <div className="mnemonic-grid">
              {cards.map(m => (
                <MnemonicCard key={m.id} word={m.word} translation={m.translation} emoji={m.emoji} imageUrl={m.image_url} sentence={m.sentence}>
                  <button className="btn btn--light btn--sm self-start" onClick={() => setTalking(m)}>Talk about this</button>
                </MnemonicCard>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
