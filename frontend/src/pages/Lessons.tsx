import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguages } from "../hooks/useLanguages";
import {
  fetchLanguages,
  fetchLessonProgress,
  fetchLessons,
  type Language,
  type LessonSummary,
} from "../lib/lessonsApi";

const selectClass =
  "w-full rounded-[12px] border-[1.5px] border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-[var(--text-primary)] font-semibold";

export default function Lessons() {
  const navigate = useNavigate();
  const { settings, chosen, update } = useLanguages();

  const [languages, setLanguages] = useState<Language[]>([]);
  const [lessons, setLessons]     = useState<LessonSummary[]>([]);
  const [progress, setProgress]   = useState<Record<string, { mastery: number }>>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetchLanguages().then(setLanguages).catch(err => setError(err.message));
    fetchLessonProgress().then(setProgress);
  }, []);

  useEffect(() => {
    if (settings.native_lang === settings.learning_lang) return;
    setLoading(true);
    setError(null);
    fetchLessons(settings.learning_lang, settings.native_lang)
      .then(setLessons)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [settings.learning_lang, settings.native_lang]);

  const choose = (field: "native_lang" | "learning_lang", value: string) => {
    const next = { ...settings, [field]: value };
    if (next.native_lang === next.learning_lang) {
      const other = languages.find(l => l.code !== value)?.code;
      if (!other) return;
      if (field === "native_lang") next.learning_lang = other;
      else next.native_lang = other;
    }
    update(next);
  };

  const ready = lessons.filter(l => l.sentence_count > 0).length;

  return (
    <div className="flex-1 bg-[var(--bg-base)] min-h-full">
      <main className="max-w-[760px] mx-auto px-5 py-10 flex flex-col gap-8">
        <div>
          <p className="text-[0.72rem] font-bold text-[var(--c-green)] uppercase tracking-[0.1em] mb-2">Lessons</p>
          <h1 className="text-[2rem] font-black text-[var(--text-primary)] m-0">Learn step by step</h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Each lesson teaches a few words, then uses them in real sentences you build and hear.
          </p>
        </div>

        <section className="bg-[var(--bg-card)] rounded-[20px] border-[1.5px] border-[var(--border-subtle)] p-6 shadow-[var(--shadow-card)]">
          {!chosen && (
            <p className="text-sm font-semibold text-[var(--c-purple)] mb-4">First, tell us which languages you speak and learn.</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-sm font-bold text-[var(--text-secondary)]">
              I speak
              <select className={selectClass} value={settings.native_lang} onChange={e => choose("native_lang", e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-bold text-[var(--text-secondary)]">
              I want to learn
              <select className={selectClass} value={settings.learning_lang} onChange={e => choose("learning_lang", e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        {error && <p className="text-[var(--state-wrong)] font-semibold">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-10 h-10 border-[3px] border-[var(--c-purple-ring)] border-t-[var(--c-purple)] rounded-full animate-spin" />
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] m-0">
              {lessons.length} lessons · {ready} with sentences
            </p>
            {lessons.length === 0 && (
              <p className="text-[var(--text-secondary)]">No lessons for this language pair yet. Try another one.</p>
            )}
            {lessons.map(lesson => {
              const done = (progress[String(lesson.id)]?.mastery ?? 0) > 0;
              return (
                <button
                  key={lesson.id}
                  onClick={() => navigate(`/lessons/${lesson.id}`)}
                  className="text-left flex items-center gap-4 rounded-[16px] border-[1.5px] border-[var(--border-subtle)] bg-[var(--bg-card)] px-5 py-4 cursor-pointer transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <span className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white bg-[var(--grad-purple-green)] flex-shrink-0">
                    {done ? "✓" : lesson.position}
                  </span>
                  <span className="flex-1">
                    <span className="block font-bold text-[var(--text-primary)]">{lesson.title}</span>
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {lesson.word_count} words · {lesson.sentence_count > 0 ? `${lesson.sentence_count} sentences` : "words only"}
                    </span>
                  </span>
                  <span className="text-[var(--text-tertiary)] font-bold">→</span>
                </button>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
