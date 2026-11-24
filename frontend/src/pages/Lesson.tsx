import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BuildStep from "../components/lesson/BuildStep";
import LearnStep from "../components/lesson/LearnStep";
import ListenStep from "../components/lesson/ListenStep";
import MatchStep from "../components/lesson/MatchStep";
import { PrimaryButton, SecondaryButton, StepCard } from "../components/lesson/shared";
import { useAuth } from "../context/AuthContext";
import { useLanguages } from "../hooks/useLanguages";
import { fetchLesson, saveLessonResult, type LessonDetail } from "../lib/lessonsApi";

type Step = "learn" | "match" | "build" | "listen" | "done";
const PASS_RATE = 0.7;
const MAX_SENTENCES = 5;
const MAX_LISTENING = 4;

export default function Lesson() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useLanguages();

  const [lesson, setLesson]   = useState<LessonDetail | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [step, setStep]       = useState<Step>("learn");
  const [score, setScore]     = useState({ correct: 0, total: 0 });
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    setLesson(null);
    setError(null);
    setStep("learn");
    setScore({ correct: 0, total: 0 });
    setSaved(false);
    fetchLesson(Number(lessonId), settings.learning_lang, settings.native_lang)
      .then(setLesson)
      .catch(err => setError(err.message));
  }, [lessonId, settings.learning_lang, settings.native_lang]);

  const steps = useMemo<Step[]>(() => {
    if (!lesson) return [];
    const list: Step[] = ["learn"];
    if (lesson.words.length >= 2) list.push("match");
    if (lesson.sentences.length > 0) list.push("build");
    if (lesson.listening.length > 0) list.push("listen");
    list.push("done");
    return list;
  }, [lesson]);

  const goNext = (correct = 0, total = 0) => {
    setScore(s => ({ correct: s.correct + correct, total: s.total + total }));
    setStep(steps[steps.indexOf(step) + 1] ?? "done");
  };

  useEffect(() => {
    if (step !== "done" || !lesson || !user || saved) return;
    const passed = score.total === 0 || score.correct / score.total >= PASS_RATE;
    saveLessonResult(lesson.id, passed).catch(() => {});
    setSaved(true);
  }, [step, lesson, user, saved, score]);

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="text-[40px]">😕</div>
        <p className="text-[var(--text-secondary)]">{error}</p>
        <SecondaryButton onClick={() => navigate("/lessons")}>Back to lessons</SecondaryButton>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-[3px] border-[var(--c-purple-ring)] border-t-[var(--c-purple)] rounded-full animate-spin" />
      </div>
    );
  }

  if (lesson.words.length === 0) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-5 text-center">
        <div className="text-[40px]">🐢</div>
        <p className="text-[var(--text-secondary)]">This lesson has no words in your languages yet.</p>
        <SecondaryButton onClick={() => navigate("/lessons")}>Back to lessons</SecondaryButton>
      </div>
    );
  }

  const percent = score.total ? Math.round((score.correct / score.total) * 100) : 100;
  const stepIndex = steps.indexOf(step);

  return (
    <div className="flex-1 bg-[var(--bg-base)] min-h-full">
      <main className="max-w-[760px] mx-auto px-5 py-10 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <button onClick={() => navigate("/lessons")} className="text-sm font-bold text-[var(--text-secondary)] bg-transparent border-none cursor-pointer p-0">
              ← All lessons
            </button>
            <h1 className="text-[1.75rem] font-extrabold text-[var(--text-primary)] mt-1 mb-0">
              Lesson {lesson.position}: {lesson.title}
            </h1>
          </div>
        </div>

        <div className="flex gap-2">
          {steps.map((name, i) => (
            <div
              key={name}
              className={`h-[6px] flex-1 rounded-full ${i <= stepIndex ? "bg-[var(--grad-progress)]" : "bg-[var(--border-subtle)]"}`}
            />
          ))}
        </div>

        {step === "learn" && <LearnStep words={lesson.words} learning={lesson.learning} onDone={() => goNext()} />}
        {step === "match" && <MatchStep words={lesson.words} onDone={goNext} />}
        {step === "build" && (
          <BuildStep sentences={lesson.sentences.slice(0, MAX_SENTENCES)} learning={lesson.learning} onDone={goNext} />
        )}
        {step === "listen" && <ListenStep items={lesson.listening.slice(0, MAX_LISTENING)} onDone={goNext} />}
        {step === "done" && (
          <StepCard eyebrow="Lesson complete" title={percent >= PASS_RATE * 100 ? "🎉 Well done!" : "Good effort — try it again!"}>
            <p className="text-[var(--text-secondary)] mt-0">
              You got <span className="font-bold text-[var(--text-primary)]">{score.correct} of {score.total}</span> answers right ({percent}%).
            </p>
            {lesson.sentences.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)]">This lesson has no sentences yet. Run: make build-lessons</p>
            )}
            {!user && <p className="text-sm text-[var(--text-tertiary)]">Sign in to save your progress.</p>}
            <div className="flex gap-3 flex-wrap mt-4">
              <PrimaryButton onClick={() => navigate(`/lessons/${lesson.id + 1}`)}>Next lesson →</PrimaryButton>
              <SecondaryButton onClick={() => navigate("/lessons")}>All lessons</SecondaryButton>
            </div>
          </StepCard>
        )}
      </main>
    </div>
  );
}
