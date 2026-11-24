import type { ReactNode } from "react";
import type { Recording } from "../../lib/lessonsApi";

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

let currentAudio: HTMLAudioElement | null = null;

export function playRecording(recording: Recording | null, fallback: () => void) {
  currentAudio?.pause();
  if (!recording) {
    fallback();
    return;
  }
  const audio = new Audio(recording.url);
  currentAudio = audio;
  audio.play().catch(fallback);
}

export function Attribution({ recording }: { recording: Recording | null }) {
  if (!recording) return null;
  const author = recording.author ?? "unknown";
  return (
    <p className="text-[11px] text-[var(--text-tertiary)] mt-2 mb-0">
      Recording by{" "}
      {recording.attribution_url ? (
        <a href={recording.attribution_url} target="_blank" rel="noreferrer" className="underline">{author}</a>
      ) : author}
      {recording.license ? ` · ${recording.license}` : ""} · from Tatoeba
    </p>
  );
}

export function StepCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="bg-[var(--bg-card)] rounded-[24px] border-[1.5px] border-[var(--border-subtle)] p-7 shadow-[var(--shadow-card)]">
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--c-purple-muted)] mb-1">{eyebrow}</p>
      <h2 className="text-xl font-extrabold text-[var(--text-primary)] mt-0 mb-5">{title}</h2>
      {children}
    </section>
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-6 py-3 rounded-[14px] font-bold text-[0.95rem] border-none ${
        disabled
          ? "cursor-not-allowed bg-[var(--bg-surface)] text-[var(--text-tertiary)]"
          : "cursor-pointer bg-[var(--grad-purple-green)] text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 rounded-[14px] font-bold text-[0.9rem] cursor-pointer border-[1.5px] border-[var(--border-medium)] bg-transparent text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

export function Feedback({ correct, children }: { correct: boolean; children: ReactNode }) {
  return (
    <div
      className={`px-5 py-[14px] rounded-[14px] my-5 font-bold text-[15px] border-[1.5px] ${
        correct
          ? "bg-[var(--state-correct-bg)] border-[var(--state-correct-bd)] text-[var(--state-correct)]"
          : "bg-[var(--state-wrong-bg)] border-[var(--state-wrong-bd)] text-[var(--state-wrong)]"
      }`}
    >
      {children}
    </div>
  );
}
