import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguages } from "../hooks/useLanguages";
import { fetchAiUsage, type AiUsageToday } from "../lib/agentsApi";
import { fetchLessonProgress, fetchLessons, type LessonSummary } from "../lib/lessonsApi";

interface PracticeLinkProps { heading: string; sub: string; tone?: "pink" | "mint" | "lime"; onClick: () => void; }

function PracticeLink({ heading, sub, tone = "pink", onClick }: PracticeLinkProps) {
  return (
    <button className={`way__link way__link--${tone}`} onClick={onClick}>
      <span>{heading}</span>
      <span>{sub}</span>
    </button>
  );
}

interface PathState { next: LessonSummary | null; done: number; total: number; }

export default function Dashboard() {
  const navigate = useNavigate();
  const { settings } = useLanguages();
  const [path, setPath] = useState<PathState | null>(null);
  const [usage, setUsage] = useState<AiUsageToday | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAiUsage().then(data => { if (!cancelled) setUsage(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLessons(settings.learning_lang, settings.native_lang), fetchLessonProgress()])
      .then(([lessons, progress]) => {
        if (cancelled) return;
        const isDone = (lesson: LessonSummary) => (progress[String(lesson.id)]?.mastery ?? 0) > 0;
        setPath({
          next: lessons.find(lesson => !isDone(lesson)) ?? null,
          done: lessons.filter(isDone).length,
          total: lessons.length,
        });
      })
      .catch(() => { if (!cancelled) setPath({ next: null, done: 0, total: 0 }); });
    return () => { cancelled = true; };
  }, [settings.learning_lang, settings.native_lang]);

  const next = path?.next;
  const pathSub = !path
    ? "Loading your path…"
    : path.total === 0
      ? "No topics yet"
      : `${path.done} of ${path.total} topics done · every word trained four ways`;

  return (
    <>
      <header className="page-header grid-bg">
        <div className="container page-header__inner">
          <p className="eyebrow">Welcome back</p>
          <h1 className="display">Ready to <em>learn</em>?</h1>
          {usage && (
            <p className="small ai-usage" aria-live="polite">
              AI answers today: {usage.used_today} of {usage.daily_limit}
              {usage.is_admin && <> · <Link to="/staff-room" className="ai-usage__admin">Open staff room →</Link></>}
            </p>
          )}
        </div>
      </header>

      <div className="container ways">
        <section className="way way--path" aria-labelledby="path-title">
          <div className="path-card__meta">
            <span className="eyebrow">Vocabulary topics</span>
            <span className="small">{path ? `${path.done} of ${path.total} topics done` : "Loading…"}</span>
          </div>
          <p className="eyebrow">{next ? "Next topic" : "Topics"}</p>
          <h2 id="path-title" className="h1">
            {next ? next.title : path && path.total > 0 && path.done === path.total ? "All topics done" : "Topics"}
          </h2>
          <p className="muted">{pathSub}</p>
          {path && path.total > 0 && <progress value={path.done} max={path.total} aria-label="Topics done" />}
          <div className="row">
            <button className="btn btn--primary" onClick={() => navigate(next ? `/lessons/${next.id}` : "/lessons")}>
              {next ? "Continue" : "Open topics"}
            </button>
            <button className="btn btn--secondary" onClick={() => navigate("/lessons")}>See all topics</button>
          </div>
        </section>

        <section className="way way--practice" aria-labelledby="practice-title">
          <span className="eyebrow">Free practice</span>
          <h2 id="practice-title" className="h2">Train any time, in any order.</h2>
          <p className="muted">Uses all words and sentences, not one topic.</p>
          <PracticeLink heading="Match" sub="5 random pairs a round →" tone="pink" onClick={() => navigate("/game")} />
          <PracticeLink heading="Sentence shuffle" sub="Real Tatoeba sentences →" tone="mint" onClick={() => navigate("/sentence-builder")} />
          <PracticeLink heading="Picture cards" sub="Your sentences as flashcards →" tone="lime" onClick={() => navigate("/mnemonics")} />
        </section>
      </div>
    </>
  );
}
