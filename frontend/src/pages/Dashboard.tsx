import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguages } from "../hooks/useLanguages";
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
      ? "No lessons yet"
      : `${path.done} of ${path.total} lessons done · 10 words each, trained four ways`;

  return (
    <>
      <header className="page-header grid-bg">
        <div className="container page-header__inner">
          <p className="eyebrow">Welcome back</p>
          <h1 className="display">Ready to <em>learn</em>?</h1>
        </div>
      </header>

      <div className="container ways">
        <section className="way way--path" aria-labelledby="path-title">
          <div className="path-card__meta">
            <span className="eyebrow">Learning path</span>
            <span className="small">{path ? `${path.done} of ${path.total} lessons done` : "Loading…"}</span>
          </div>
          <p className="eyebrow">{next ? `Next · Lesson ${next.position}` : "Lessons"}</p>
          <h2 id="path-title" className="h1">
            {next ? next.title : path && path.total > 0 && path.done === path.total ? "Path complete" : "Lessons"}
          </h2>
          <p className="muted">{pathSub}</p>
          {path && path.total > 0 && <progress value={path.done} max={path.total} aria-label="Lessons done" />}
          <div className="row">
            <button className="btn btn--primary" onClick={() => navigate(next ? `/lessons/${next.id}` : "/lessons")}>
              {next ? "Continue" : "Open lessons"}
            </button>
            <button className="btn btn--secondary" onClick={() => navigate("/lessons")}>See all lessons</button>
          </div>
        </section>

        <section className="way way--practice" aria-labelledby="practice-title">
          <span className="eyebrow">Free practice</span>
          <h2 id="practice-title" className="h2">Train any time, in any order.</h2>
          <p className="muted">Uses all words and sentences, not one lesson.</p>
          <PracticeLink heading="Match" sub="5 random pairs a round →" tone="pink" onClick={() => navigate("/game")} />
          <PracticeLink heading="Sentence shuffle" sub="Real Tatoeba sentences →" tone="mint" onClick={() => navigate("/sentence-builder")} />
          <PracticeLink heading="My memory tricks" sub="AI picture stories →" tone="lime" onClick={() => navigate("/mnemonics")} />
        </section>
      </div>
    </>
  );
}
