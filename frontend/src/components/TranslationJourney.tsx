import { useEffect, useRef, useState } from "react";
import Flag from "./atoms/Flag";
import { scrambleFrame } from "../lib/scramble";

const PHRASES = [
  { lang: "eng", text: "Hello, how are you?" },
  { lang: "spa", text: "Hola, ¿cómo estás?" },
  { lang: "cat", text: "Hola, com estàs?" },
  { lang: "rus", text: "Привет, как дела?" },
];

const TRAVEL_MS = 1600;
const PAUSE_MS = 350;
const MORPH_MS = 900;
const SHOW_MS = 1100;
const LEAVE_MS = 1400;

type Phase = "start" | "arriving" | "morphing" | "leaving";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export default function TranslationJourney() {
  const [step, setStep]   = useState(0);
  const [phase, setPhase] = useState<Phase>("start");
  const [text, setText]   = useState(PHRASES[0].text);
  const [lang, setLang]   = useState(PHRASES[0].lang);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const from = PHRASES[step % PHRASES.length];
    const to = PHRASES[(step + 1) % PHRASES.length];
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    if (prefersReducedMotion()) {
      later(0, () => {
        setText(to.text);
        setLang(to.lang);
      });
      later(2500, () => setStep(s => s + 1));
      return () => timers.forEach(clearTimeout);
    }

    frame.current = requestAnimationFrame(() => {
      setText(from.text);
      setLang(from.lang);
      setPhase("start");
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => setPhase("arriving"));
      });
    });

    later(TRAVEL_MS + PAUSE_MS, () => {
      setPhase("morphing");
      const began = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - began) / MORPH_MS);
        setText(scrambleFrame(from.text, to.text, progress));
        if (progress >= 0.5) setLang(to.lang);
        if (progress < 1) frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    });
    later(TRAVEL_MS + PAUSE_MS + MORPH_MS + SHOW_MS, () => setPhase("leaving"));
    later(TRAVEL_MS + PAUSE_MS + MORPH_MS + SHOW_MS + LEAVE_MS, () => setStep(s => s + 1));

    return () => {
      timers.forEach(clearTimeout);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [step]);

  return (
    <div className="journey">
      <p className="visually-hidden">“Hello, how are you?” in English, Spanish, Catalan and Russian.</p>
      <div className="journey__track" aria-hidden="true">
        <span className="journey__line" />
        <span className="journey__hub">
          <img src="/turtle.png" alt="" />
        </span>
        <span className="journey__bubble" data-phase={phase}>
          <span className="journey__flag" key={lang}><Flag lang={lang} size={32} /></span>
          <span className="journey__text" lang={lang === "eng" ? "en" : lang === "spa" ? "es" : lang === "cat" ? "ca" : "ru"}>{text}</span>
        </span>
      </div>
    </div>
  );
}
