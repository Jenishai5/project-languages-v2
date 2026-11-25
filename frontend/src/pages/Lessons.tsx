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
    <>
      <header className="page-header grid-bg">
        <div className="container page-header__inner">
          <p className="eyebrow">Learning path</p>
          <h1 className="display">Learn <em>step</em> by step.</h1>
          <p className="lead">Each lesson teaches ten words, then trains them in matching, sentences, speaking and pictures.</p>
        </div>
      </header>

      <div className="container page-body">
        <section className="panel stack">
          {!chosen && <p className="h3">First, tell us which languages you speak and learn.</p>}
          <div className="lang-picker">
            <label className="field">
              <span className="field__label">I speak</span>
              <select className="select" value={settings.native_lang} onChange={e => choose("native_lang", e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">I want to learn</span>
              <select className="select" value={settings.learning_lang} onChange={e => choose("learning_lang", e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        {error && <p className="alert" data-type="error" role="alert">{error}</p>}

        {loading ? (
          <div className="spinner" role="status" aria-label="Loading lessons" />
        ) : (
          <section className="stack">
            <p className="eyebrow">{lessons.length} lessons · {ready} with sentences</p>
            {lessons.length === 0 && <p className="muted">No lessons for this language pair yet. Try another one.</p>}
            <div className="lesson-list">
              {lessons.map(lesson => {
                const done = (progress[String(lesson.id)]?.mastery ?? 0) > 0;
                return (
                  <button
                    key={lesson.id}
                    className="lesson-row"
                    data-state={done ? "done" : "todo"}
                    onClick={() => navigate(`/lessons/${lesson.id}`)}
                  >
                    <span className="lesson-row__num" aria-hidden="true">{done ? "✓" : lesson.position}</span>
                    <span className="lesson-row__body">
                      <span className="lesson-row__title">
                        {lesson.title}
                        {done && <span className="visually-hidden"> (done)</span>}
                      </span>
                      <span className="lesson-row__meta">
                        {lesson.word_count} words · {lesson.sentence_count > 0 ? `${lesson.sentence_count} sentences` : "words only"}
                      </span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
