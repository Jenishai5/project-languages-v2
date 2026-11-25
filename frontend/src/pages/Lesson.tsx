import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BuildStep from "../components/lesson/BuildStep";
import MatchStep from "../components/lesson/MatchStep";
import PictureStep from "../components/lesson/PictureStep";
import PronounceStep from "../components/lesson/PronounceStep";
import TrainingMenu from "../components/lesson/TrainingMenu";
import { TRAININGS, type Training, type TrainingResult } from "../lib/trainings";
import WordList from "../components/lesson/WordList";
import { PrimaryButton, SecondaryButton, StepCard } from "../components/lesson/shared";
import { useAuth } from "../context/AuthContext";
import { useLanguages } from "../hooks/useLanguages";
import { fetchLesson, saveLessonResult, type LessonDetail } from "../lib/lessonsApi";

const PASS_RATE = 0.7;

type Results = Partial<Record<Training, TrainingResult>>;

export default function Lesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useLanguages();

  const [loaded, setLoaded]   = useState<{ key: string; lesson: LessonDetail | null; error: string | null }>({ key: "", lesson: null, error: null });
  const [visit, setVisit]     = useState<{ key: string; active: Training | null; results: Results }>({ key: "", active: null, results: {} });

  const key = `${lessonId}:${settings.learning_lang}:${settings.native_lang}`;
  const lesson = loaded.key === key ? loaded.lesson : null;
  const error  = loaded.key === key ? loaded.error : null;
  const active  = visit.key === key ? visit.active : null;
  const results = visit.key === key ? visit.results : {};
  const setActive  = (training: Training | null) => setVisit({ key, active: training, results });
  const setResults = (next: Results) => setVisit({ key, active: null, results: next });

  useEffect(() => {
    let cancelled = false;
    fetchLesson(Number(lessonId), settings.learning_lang, settings.native_lang)
      .then(data => { if (!cancelled) setLoaded({ key, lesson: data, error: null }); })
      .catch(err => { if (!cancelled) setLoaded({ key, lesson: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [key, lessonId, settings.learning_lang, settings.native_lang]);

  const available: Record<Training, boolean> = {
    match:     (lesson?.words.length ?? 0) >= 2,
    shuffle:   (lesson?.sentences.length ?? 0) > 0,
    pronounce: (lesson?.words.length ?? 0) > 0,
    picture:   (lesson?.pictures.length ?? 0) > 0,
  };
  const openTrainings = TRAININGS.filter(t => available[t.id]);
  const allDone = openTrainings.length > 0 && openTrainings.every(t => results[t.id]);
  const correct = Object.values(results).reduce((sum, r) => sum + (r?.correct ?? 0), 0);
  const total   = Object.values(results).reduce((sum, r) => sum + (r?.total ?? 0), 0);
  const percent = total ? Math.round((correct / total) * 100) : 100;

  const finish = (training: Training) => (c: number, t: number) => {
    const next = { ...results, [training]: { correct: c, total: t } };
    setResults(next);
    const finished = !allDone && openTrainings.every(o => next[o.id]);
    if (finished && lesson && user) {
      const sum = Object.values(next).reduce((acc, r) => ({ c: acc.c + (r?.correct ?? 0), t: acc.t + (r?.total ?? 0) }), { c: 0, t: 0 });
      saveLessonResult(lesson.id, sum.t === 0 || sum.c / sum.t >= PASS_RATE).catch(() => {});
    }
  };

  if (error) {
    return (
      <div>
        <div>😕</div>
        <p>{error}</p>
        <SecondaryButton onClick={() => navigate("/lessons")}>Back to lessons</SecondaryButton>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div>
      </div>
    );
  }

  if (lesson.words.length === 0) {
    return (
      <div>
        <div>🐢</div>
        <p>This lesson has no words in your languages yet.</p>
        <SecondaryButton onClick={() => navigate("/lessons")}>Back to lessons</SecondaryButton>
      </div>
    );
  }

  return (
    <div>
      <main>
        <div>
          <button
            onClick={() => (active ? setActive(null) : navigate("/lessons"))}
          >
            {active ? "← Back to lesson" : "← All lessons"}
          </button>
          <h1>
            Lesson {lesson.position}: {lesson.title}
          </h1>
        </div>

        {active === "match" && <MatchStep words={lesson.words} onDone={finish("match")} />}
        {active === "shuffle" && <BuildStep sentences={lesson.sentences} learning={lesson.learning} onDone={finish("shuffle")} />}
        {active === "pronounce" && <PronounceStep words={lesson.words} learning={lesson.learning} onDone={finish("pronounce")} />}
        {active === "picture" && <PictureStep rounds={lesson.pictures} onDone={finish("picture")} />}

        {active === null && (
          <>
            {allDone && (
              <StepCard eyebrow="Lesson complete" title={percent >= PASS_RATE * 100 ? "🎉 Well done!" : "Good effort — try the trainings again!"}>
                <p>
                  You got <span>{correct} of {total}</span> answers right ({percent}%).
                </p>
                {!user && <p>Sign in to save your progress.</p>}
                <div>
                  <PrimaryButton onClick={() => navigate(`/lessons/${lesson.id + 1}`)}>Next lesson →</PrimaryButton>
                  <SecondaryButton onClick={() => setResults({})}>Start again</SecondaryButton>
                </div>
              </StepCard>
            )}

            <StepCard eyebrow={`${lesson.words.length} words`} title="Your words · tap to hear">
              <WordList words={lesson.words} learning={lesson.learning} />
            </StepCard>

            <StepCard eyebrow={`${openTrainings.filter(t => results[t.id]).length} of ${openTrainings.length} done`} title="Choose a training">
              <TrainingMenu available={available} results={results} onOpen={setActive} />
              {!available.shuffle && (
                <p>Shuffle needs sentences. Run: make build-lessons</p>
              )}
            </StepCard>
          </>
        )}
      </main>
    </div>
  );
}
