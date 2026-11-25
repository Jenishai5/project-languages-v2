import type { ReactNode } from "react";
import type { Recording } from "../../lib/lessonsApi";

export function Attribution({ recording }: { recording: Recording | null }) {
  if (!recording) return null;
  const author = recording.author ?? "unknown";
  return (
    <p>
      Recording by{" "}
      {recording.attribution_url ? (
        <a href={recording.attribution_url} target="_blank" rel="noreferrer">{author}</a>
      ) : author}
      {recording.license ? ` · ${recording.license}` : ""} · from Tatoeba
    </p>
  );
}

export function StepCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section>
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Feedback({ correct, children }: { correct: boolean; children: ReactNode }) {
  return (
    <div role="status" data-state={correct ? "correct" : "wrong"}>
      {children}
    </div>
  );
}
