import type { ReactNode } from "react";
import type { Recording } from "../../lib/lessonsApi";

export function Attribution({ recording }: { recording: Recording | null }) {
  if (!recording) return null;
  const author = recording.author ?? "unknown";
  return (
    <p className="attribution">
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
    <section className="card step-card">
      <div className="step-card__head">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="h2">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="btn btn--primary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="btn btn--secondary" onClick={onClick}>
      {children}
    </button>
  );
}

export function Feedback({ correct, children }: { correct: boolean; children: ReactNode }) {
  return (
    <div className="feedback" role="status" data-state={correct ? "correct" : "wrong"}>
      {children}
    </div>
  );
}
