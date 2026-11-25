import { useOutletContext, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthModal from "../components/organisms/AuthModal";
import Flag from "../components/atoms/Flag";
import SnakeTranslate from "../components/morph/SnakeTranslate";

const TRAININGS = [
  { name: "Match", hint: "Word and translation" },
  { name: "Shuffle", hint: "Build 5 sentences" },
  { name: "Pronounce", hint: "Say each word" },
  { name: "Picture", hint: "Picture to word" },
];

export default function Landing() {
  const { showAuth, setShowAuth } = useOutletContext<{ showAuth: boolean; setShowAuth: (v: boolean) => void }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const go = (path: string) => (user ? navigate(path) : setShowAuth(true));

  return (
    <div>
      <section className="hero grid-bg">
        <div className="container hero__inner">
          <div className="hero__copy">
            <ul className="hero__langs" aria-label="Languages">
              <li className="hero__lang"><span className="spin"><Flag lang="eng" size={40} /></span><span className="visually-hidden">English</span></li>
              <li className="hero__lang"><span className="spin"><Flag lang="spa" size={40} /></span><span className="visually-hidden">Español</span></li>
              <li className="hero__lang"><span className="spin"><Flag lang="rus" size={40} /></span><span className="visually-hidden">Русский</span></li>
              <li className="hero__lang"><span className="spin"><Flag lang="cat" size={40} /></span><span className="visually-hidden">Català</span></li>
            </ul>
            <h1 className="display">
              Ten words today.<br />A <em>conversation</em><br />tomorrow.
            </h1>
            <div className="row">
              <button className="btn btn--primary btn--lg" onClick={() => go("/lessons")}>
                {user ? "Continue learning" : "Start lesson one"}
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9h12M10 4l5 5-5 5" /></svg>
              </button>
              <button className="btn btn--light btn--lg" onClick={() => go("/game")}>Try free practice</button>
            </div>
          </div>

          <div className="hero__art" aria-hidden="true">
            <div className="float float--card">
              <div className="row row--between">
                <span className="eyebrow">Translation</span>
                <span className="badge">Lesson 3</span>
              </div>
              <p className="serif float__word">doctor</p>
              <div className="stack stack--tight">
                <div className="float__row"><b>ES</b>el médico</div>
                <div className="float__row"><b>RU</b>врач</div>
              </div>
            </div>
            <div className="float float--sentence stack">
              <span className="eyebrow">Put it back together</span>
              <div className="row">
                <span className="tile"><span className="tile__word">The</span></span>
                <span className="tile" data-word-type="noun"><span className="tile__word">doctor</span></span>
                <span className="tile" data-word-type="verb"><span className="tile__word">reads</span></span>
                <span className="tile tile--empty"><span className="tile__word">the</span></span>
                <span className="tile tile--empty"><span className="tile__word">paper</span></span>
              </div>
              <div className="row small"><progress value={3} max={5} /></div>
            </div>
            <div className="float float--say">
              <span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="6" y="2" width="6" height="9" rx="3" /><path d="M3.5 8.5a5.5 5.5 0 0 0 11 0M9 14v2.5" /></svg>
              </span>
              <span>Say “el papel”</span>
            </div>
          </div>
        </div>
      </section>

      <section className="container ways-section">
        <SnakeTranslate />
        <div className="section-head">
          <h2 className="h1">Learn your way.<br />Same words, two paths.</h2>
          <p className="lead">Follow the path lesson by lesson, or drop into free practice whenever you have five minutes.</p>
        </div>
        <div className="ways">
          <article className="way way--path">
            <span className="eyebrow">Learning path</span>
            <h3 className="h2">36 lessons, 10 words each</h3>
            <p className="muted">Every lesson trains the same words four ways.</p>
            <div className="choice-grid">
              {TRAININGS.map(t => (
                <div key={t.name} className="training">
                  <span className="training__title">{t.name}</span>
                  <span className="training__hint">{t.hint}</span>
                </div>
              ))}
            </div>
            <button className="btn btn--primary self-start" onClick={() => go("/lessons")}>Open the lessons</button>
          </article>

          <article className="way way--practice">
            <span className="eyebrow">Free practice</span>
            <h3 className="h2">Any word, any time.</h3>
            <p className="muted">Random words and real sentences from the whole dictionary.</p>
            <button className="way__link way__link--pink" onClick={() => go("/game")}>
              <span>Match</span><span>5 pairs a round →</span>
            </button>
            <button className="way__link way__link--mint" onClick={() => go("/sentence-builder")}>
              <span>Sentence shuffle</span><span>Real Tatoeba sentences →</span>
            </button>
          </article>
        </div>
      </section>

      <section className="container quote-band">
        <blockquote>“The same word, three ways: <em>doctor</em>, el médico, врач.”</blockquote>
        <ul className="flag-list">
          <li className="flag-chip"><Flag lang="eng" size={56} /><span>English</span></li>
          <li className="flag-chip"><Flag lang="spa" size={56} /><span>Español</span></li>
          <li className="flag-chip"><Flag lang="rus" size={56} /><span>Русский</span></li>
        </ul>
      </section>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
