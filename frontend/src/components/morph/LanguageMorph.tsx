import { useState } from "react";
import Flag from "../atoms/Flag";
import TextMorph from "./TextMorph";

type Phrase = { lang: string; code: string; name: string; text: string };

const PHRASES: Phrase[] = [
  { lang: "spa", code: "es", name: "Spanish", text: "Hola, ¿cómo estás?" },
  { lang: "cat", code: "ca", name: "Catalan", text: "Hola, com estàs?" },
  { lang: "eng", code: "en", name: "English", text: "Hello, how are you?" },
  { lang: "rus", code: "ru", name: "Russian", text: "Привет, как дела?" },
];

type Props = { phrases?: Phrase[]; duration?: number; hold?: number };

export default function LanguageMorph({ phrases = PHRASES, duration = 2.6, hold = 1.8 }: Props) {
  const [step, setStep] = useState(0);
  const current = phrases[step % phrases.length];
  const next = phrases[(step + 1) % phrases.length];

  return (
    <figure className="morph-showcase">
      <figcaption className="morph-showcase__langs" key={step}>
        <span className="morph-showcase__lang"><Flag lang={current.lang} size={24} />{current.name}</span>
        <span className="morph-showcase__arrow" aria-hidden="true">→</span>
        <span className="morph-showcase__lang"><Flag lang={next.lang} size={24} />{next.name}</span>
      </figcaption>
      <TextMorph
        className="morph-showcase__text"
        from={current.text}
        to={next.text}
        fromLang={current.code}
        toLang={next.code}
        duration={duration}
        delay={hold}
        onComplete={() => setStep(s => s + 1)}
      />
    </figure>
  );
}
