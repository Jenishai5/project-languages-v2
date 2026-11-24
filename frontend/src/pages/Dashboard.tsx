import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguages } from "../hooks/useLanguages";
import { fetchLessonProgress, fetchLessons, type LessonSummary } from "../lib/lessonsApi";

interface CardProps { accent: string; label: string; heading: string; sub: string; cta: string; onClick: () => void; }

function Card({ accent, label, heading, sub, cta, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className="relative rounded-[24px] overflow-hidden cursor-pointer shadow-[var(--shadow-game-card)] transition-transform duration-200 hover:-translate-y-[3px]"
    >
      <div className="absolute inset-0" style={{ background: accent }} />
      <div className="absolute inset-0 bg-[var(--overlay-card)] backdrop-blur-[1px]" />
      <div className="relative px-8 py-9 flex justify-between items-center gap-6 flex-wrap">
        <div>
          <p className="text-white text-[0.72rem] font-bold uppercase tracking-[0.1em] mb-[6px]">{label}</p>
          <h3 className="text-[1.6rem] font-black text-white m-0">{heading}</h3>
          <p className="text-white/70 mt-[6px] text-sm mb-0">{sub}</p>
        </div>
        <button className="px-6 py-3 rounded-[14px] border-none cursor-pointer bg-[var(--card-btn-bg)] font-bold text-[0.95rem] text-[var(--card-btn-text)] whitespace-nowrap flex-shrink-0">
          {cta}
        </button>
      </div>
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-extrabold text-[var(--text-primary)] m-0">{title}</h2>
      <p className="text-sm text-[var(--text-secondary)] mt-1 mb-0">{sub}</p>
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
    <div className="flex-1 font-sans bg-[var(--bg-base)] min-h-full">
      <main className="max-w-[700px] mx-auto px-6 py-14 flex flex-col gap-10">
        <div>
          <p className="text-[0.72rem] font-bold text-[var(--c-green)] uppercase tracking-[0.1em] mb-2">Welcome back</p>
          <h1 className="text-[2.25rem] font-black text-[var(--text-primary)] leading-tight m-0">Ready to learn?</h1>
        </div>

        <section>
          <SectionTitle title="📚 Learning path" sub="Lessons in order. Each lesson teaches 10 new words." />
          <Card
            accent="var(--grad-full)"
            label={next ? `Next · Lesson ${next.position}` : "Lessons"}
            heading={next ? next.title : path && path.total > 0 && path.done === path.total ? "Path complete 🎉" : "Lessons"}
            sub={pathSub}
            cta={next ? "Continue →" : "Open →"}
            onClick={() => navigate(next ? `/lessons/${next.id}` : "/lessons")}
          />
          <button
            onClick={() => navigate("/lessons")}
            className="mt-3 text-sm font-bold text-[var(--text-secondary)] bg-transparent border-none cursor-pointer p-0"
          >
            See all lessons →
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <SectionTitle title="🎯 Free practice" sub="Train any time, in any order. Uses all words and sentences, not one lesson." />
          <Card
            accent="var(--grad-card-game)"
            label="Words"
            heading="🧩 Match"
            sub="5 random word pairs per round · choose a language pair"
            cta="Play →"
            onClick={() => navigate("/game")}
          />
          <Card
            accent="var(--grad-card-sentence)"
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
