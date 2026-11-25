import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguages } from "../hooks/useLanguages";
import { fetchLessonProgress, fetchLessons, type LessonSummary } from "../lib/lessonsApi";

interface CardProps { label: string; heading: string; sub: string; cta: string; onClick: () => void; }

function Card({ label, heading, sub, cta, onClick }: CardProps) {
  return (
    <section>
      <p>{label}</p>
      <h3>{heading}</h3>
      <p>{sub}</p>
      <button onClick={onClick}>{cta}</button>
    </section>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
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
      : `${path.done} of ${path.total} lessons done · 10 words each · Match, Shuffle, Pronounce, Picture`;

  return (
    <div>
      <main>
        <div>
          <p>Welcome back</p>
          <h1>Ready to learn?</h1>
        </div>

        <section>
          <SectionTitle title="📚 Learning path" sub="Lessons in order. Each lesson teaches 10 new words." />
          <Card
            label={next ? `Next · Lesson ${next.position}` : "Lessons"}
            heading={next ? next.title : path && path.total > 0 && path.done === path.total ? "Path complete 🎉" : "Lessons"}
            sub={pathSub}
            cta={next ? "Continue →" : "Open →"}
            onClick={() => navigate(next ? `/lessons/${next.id}` : "/lessons")}
          />
          <button
            onClick={() => navigate("/lessons")}
          >
            See all lessons →
          </button>
        </section>

        <section>
          <SectionTitle title="🎯 Free practice" sub="Train any time, in any order. Uses all words and sentences, not one lesson." />
          <Card
            label="Words"
            heading="🧩 Match"
            sub="5 random word pairs per round · choose a language pair"
            cta="Play →"
            onClick={() => navigate("/game")}
          />
          <Card
            label="Sentences"
            heading="🔀 Sentence shuffle"
            sub="Put real Tatoeba sentences in the right order"
            cta="Play →"
            onClick={() => navigate("/sentence-builder")}
          />
        </section>
      </main>
    </div>
  );
}
