import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MnemonicCard from "../components/mnemonics/MnemonicCard";
import { useLanguages } from "../hooks/useLanguages";
import { fetchMnemonics, type MnemonicList } from "../lib/mnemonicsApi";

export default function Mnemonics() {
  const { settings } = useLanguages();
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

  return (
    <>
      <header className="page-header grid-bg">
        <div className="container page-header__inner">
          <p className="eyebrow">Mnemonics</p>
          <h1 className="display">My memory <em>tricks</em></h1>
          <p className="lead">Every picture story you created, saved to your account.</p>
        </div>
      </header>

      <div className="container page-body">
        {error && <p className="alert" data-type="error" role="alert">{error}</p>}
        {!list && !error && <div className="spinner" role="status" aria-label="Loading memory tricks" />}
        {list && (
          <>
            <p className="eyebrow">
              {list.mnemonics.length} saved · {list.remaining_today} of {list.daily_limit} left today
            </p>
            {list.mnemonics.length === 0 ? (
              <div className="center-state">
                <p className="h3">No memory tricks yet.</p>
                <p className="muted">Open a lesson and tap “Create memory trick” on any word.</p>
                <Link className="btn btn--primary" to="/lessons">Go to lessons</Link>
              </div>
            ) : (
              <div className="mnemonic-grid">
                {list.mnemonics.map(m => (
                  <MnemonicCard key={m.id} word={m.word} translation={m.translation} emoji={m.emoji} imageUrl={m.image_url} text={m.mnemonic} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
