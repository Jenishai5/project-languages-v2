import { useOutletContext, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import AuthModal from "../components/organisms/AuthModal";

// ── Feature card data ──────────────────────────────────────
const cards = [
  {
    icon: "⚡",
    title: "Match Words",
    desc: "5 pairs per round — pick the correct translation before time runs out. Fast and addictive.",
  },
  {
    icon: "🧩",
    title: "Build Sentences",
    desc: "Drag coloured tiles into the right order. Every word is colour-coded by grammar role.",
  },
  {
    icon: "🌍",
    title: "4 Languages",
    desc: "English ↔ Spanish, English ↔ Russian, Spanish ↔ Russian, and Español → Emojis.",
  },
  {
    icon: "🏆",
    title: "Track Progress",
    desc: "Your score is saved every session. Watch your accuracy grow over time.",
  },
];

// ── Word pairs shown in the 3D device mockup ──────────────
const mockPairs = [
  { q: "dog",   a: "perro" },
  { q: "house", a: "casa" },
  { q: "water", a: "agua" },
  { q: "cat",   a: "gato" },
  { q: "book",  a: "libro" },
];

export default function Landing() {
  const { showAuth, setShowAuth } = useOutletContext<{ showAuth: boolean; setShowAuth: (v: boolean) => void }>();
  const navigate  = useNavigate();
  const { user }  = useAuth();


  return (
    <div>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div>


        <div>

          {/* Left — headline */}
          <div>

            <div>
              Free to use · No credit card needed
            </div>

            <h1>
              Learn languages<br />
              <span>the fun way.</span>
            </h1>

            <p>
              Match words, build sentences, track your score. Four languages. Zero fluff.
            </p>

            <div>
              {["🇬🇧", "🇪🇸", "🇷🇺", "🌍"].map((f, i) => (
                <div
                  key={i}
                >{f}</div>
              ))}
            </div>

            <div>
              {user ? (
                <button
                  onClick={() => navigate("/dashboard")}
                >Go to Dashboard →</button>
              ) : (
                <>
                  <button
                    onClick={() => setShowAuth(true)}
                  >Start for free →</button>
                  <button
                    onClick={() => setShowAuth(true)}
                  >Sign in</button>
                </>
              )}
            </div>

            <div>
              {[["4", "Languages"], ["500+", "Vocabulary words"], ["Free", "Always"]].map(([v, l]) => (
                <div key={l}>
                  <span>{v}</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — 3D device mockup */}
          <div>
            <div>
              <div>
                <div>
                  <span>TurtleTalk</span>
                  <span>🏆 Score: 4</span>
                </div>
                <div>
                  <div>
                    <div>English</div>
                    {mockPairs.map(p => (
                      <div
                        key={p.q}
                      >{p.q}</div>
                    ))}
                  </div>
                  <div>
                    <div>Spanish</div>
                    {[...mockPairs].reverse().map(p => (
                      <div
                        key={p.a}
                      >{p.a}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FEATURE CARDS ────────────────────────────────────── */}
      <section>
        <div>
          <p>
            Why TurtleTalk
          </p>
          <h2>
            Everything you need<br />to level up
          </h2>

          <div>
            {cards.map((c, i) => (
              <div
                key={i}
              >
                <div>
                  <div
                  >{c.icon}</div>
                  <div>{c.title}</div>
                  <p>{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section>
        <div>
          <h2>
            Start learning today.<br />It's completely free.
          </h2>
          <p>
            Join learners already building their vocabulary every day.
          </p>
          <button
            onClick={() => user ? navigate("/dashboard") : setShowAuth(true)}
          >
            {user ? "Go to Dashboard →" : "Create free account →"}
          </button>
        </div>
      </section>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
