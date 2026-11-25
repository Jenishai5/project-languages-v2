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
    <div>
      <main>
        <div>
          <p>Lessons</p>
          <h1>Learn step by step</h1>
          <p>
            Each lesson teaches a few words, then uses them in real sentences you build and hear.
          </p>
        </div>

        <section>
          {!chosen && (
            <p>First, tell us which languages you speak and learn.</p>
          )}
          <div>
            <label>
              I speak
              <select value={settings.native_lang} onChange={e => choose("native_lang", e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
            <label>
              I want to learn
              <select value={settings.learning_lang} onChange={e => choose("learning_lang", e.target.value)}>
                {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </label>
          </div>
        </section>

        {error && <p>{error}</p>}

        {loading ? (
          <div>
          </div>
        ) : (
          <section>
            <p>
              {lessons.length} lessons · {ready} with sentences
            </p>
            {lessons.length === 0 && (
              <p>No lessons for this language pair yet. Try another one.</p>
            )}
            {lessons.map(lesson => {
              const done = (progress[String(lesson.id)]?.mastery ?? 0) > 0;
              return (
                <button
                  key={lesson.id}
                  onClick={() => navigate(`/lessons/${lesson.id}`)}
                >
                  <span>
                    {done ? "✓" : lesson.position}
                  </span>
                  <span>
                    <span>{lesson.title}</span>
                    <span>
                      {lesson.word_count} words · {lesson.sentence_count > 0 ? `${lesson.sentence_count} sentences` : "words only"}
                    </span>
                  </span>
                  <span>→</span>
                </button>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
