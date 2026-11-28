import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguages } from "../hooks/useLanguages";
import {
  fetchLanguages,
  fetchLessonProgress,
  fetchLessons,
  type Language,
  type LessonSummary,
} from "../lib/lessonsApi";
import Flag from "../components/atoms/Flag";
import { topicIcon, topicImage } from "../lib/topics";
import FeltIcon from "../components/atoms/FeltIcon";

const BENTO_SIZES = ["xl", "wide", "sm", "sm", "tall", "xl", "tall"] as const;
const BENTO_COLORS = ["matcha", "pink", "lime", "mint", "cream", "blush", "white"] as const;

export default function Lessons() {
  const navigate = useNavigate();
  const { settings, chosen, update } = useLanguages();

  const [languages, setLanguages] = useState<Language[]>([]);
  const [loaded, setLoaded]       = useState<{ key: string; lessons: LessonSummary[]; error: string | null }>({ key: "", lessons: [], error: null });
  const [progress, setProgress]   = useState<Record<string, { mastery: number }>>({});
  const [languageError, setLanguageError] = useState<string | null>(null);

  const key = `${settings.learning_lang}:${settings.native_lang}`;
  const loading = loaded.key !== key;
  const lessons = loading ? [] : loaded.lessons;
  const error = languageError ?? (loading ? null : loaded.error);

  useEffect(() => {
    fetchLanguages().then(setLanguages).catch(err => setLanguageError(err.message));
    fetchLessonProgress().then(setProgress);
  }, []);

  useEffect(() => {
    if (settings.native_lang === settings.learning_lang) return;
    let cancelled = false;
    fetchLessons(settings.learning_lang, settings.native_lang)
      .then(list => { if (!cancelled) setLoaded({ key, lessons: list, error: null }); })
      .catch(err => { if (!cancelled) setLoaded({ key, lessons: [], error: err.message }); });
    return () => { cancelled = true; };
  }, [key, settings.learning_lang, settings.native_lang]);

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
          <p className="eyebrow">Vocabulary</p>
          <h1 className="display">Learn words <em>by topic</em>.</h1>
          <p className="lead">Pick a topic — people, places, food and more — and train its words in matching, sentences, speaking and pictures.</p>
        </div>
      </header>

      <div className="container page-body">
        <section className="panel stack">
          {!chosen && <p className="h3">First, tell us which languages you speak and learn.</p>}
          <div className="lang-picker">
            <label className="field">
              <span className="field__label">I speak</span>
              <span className="lang-select">
                <Flag lang={settings.native_lang} size={44} />
                <select className="select" value={settings.native_lang} onChange={e => choose("native_lang", e.target.value)}>
                  {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </span>
            </label>
            <label className="field">
              <span className="field__label">I want to learn</span>
              <span className="lang-select">
                <Flag lang={settings.learning_lang} size={44} />
                <select className="select" value={settings.learning_lang} onChange={e => choose("learning_lang", e.target.value)}>
                  {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </span>
            </label>
          </div>
        </section>

        {error && <p className="alert" data-type="error" role="alert">{error}</p>}

        {loading ? (
          <div className="spinner" role="status" aria-label="Loading topics" />
        ) : (
          <section className="stack">
            <p className="eyebrow">{lessons.length} topics · {ready} with sentences</p>
            {lessons.length === 0 && <p className="muted">No topics for this language pair yet. Try another one.</p>}
            <div className="bento">
              {lessons.map((lesson, index) => {
                const done = (progress[String(lesson.id)]?.mastery ?? 0) > 0;
                return (
                  <button
                    key={lesson.id}
                    className="bento-card"
                    data-size={BENTO_SIZES[index % BENTO_SIZES.length]}
                    data-color={BENTO_COLORS[index % BENTO_COLORS.length]}
                    data-state={done ? "done" : "todo"}
                    style={{ "--i": index } as CSSProperties}
                    onClick={() => navigate(`/lessons/${lesson.id}`)}
                  >
                    <span className="bento-card__top">
                      <span className="bento-card__num">Topic</span>
                      {done && <span className="bento-card__tag">✓ Done</span>}
                    </span>
                    <span className="bento-card__blob" aria-hidden="true" />
                    <span className="bento-card__icon" aria-hidden="true"><FeltIcon image={topicImage(lesson.slug)} fallback={topicIcon(lesson.slug)} /></span>
                    <span className="bento-card__body">
                      <span className="bento-card__title">{lesson.title}</span>
                      <span className="bento-card__meta">
                        {lesson.word_count} words · {lesson.sentence_count > 0 ? `${lesson.sentence_count} sentences` : "words only"}
                      </span>
                    </span>
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
