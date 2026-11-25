import { useState } from "react";
import TextMorph from "./TextMorph";

type Phrase = { code: string; name: string; text: string; color: string };

const PHRASES: Phrase[] = [
  { code: "es", name: "Spanish", text: "Hola, ¿cómo estás?", color: "#F8D5D7" },
  { code: "ca", name: "Catalan", text: "Hola, com estàs?", color: "#F0F5D7" },
  { code: "en", name: "English", text: "Hello, how are you?", color: "#FEFDFB" },
  { code: "ru", name: "Russian", text: "Привет, как дела?", color: "#F0A8AA" },
];

type Props = { phrases?: Phrase[]; duration?: number; hold?: number };

export default function LanguageMorph({ phrases = PHRASES, duration = 2.6, hold = 1.8 }: Props) {
  const [step, setStep] = useState(0);
  const current = phrases[step % phrases.length];
  const next = phrases[(step + 1) % phrases.length];

  return (
    <figure className="morph-showcase">
      <figcaption className="morph-showcase__langs" key={step}>
        {current.name}
        <span className="morph-showcase__arrow" aria-hidden="true">→</span>
        {next.name}
      </figcaption>
      <TextMorph
        className="morph-showcase__text"
        from={current.text}
        to={next.text}
        fromLang={current.code}
        toLang={next.code}
        fromColor={current.color}
        toColor={next.color}
        duration={duration}
        delay={hold}
        onComplete={() => setStep(s => s + 1)}
      />
    </figure>
  );
}
