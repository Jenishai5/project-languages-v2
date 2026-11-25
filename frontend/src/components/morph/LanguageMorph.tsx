import { useState } from "react";
import TextMorph from "./TextMorph";
import FluidBackdrop from "./FluidBackdrop";

type Phrase = { code: string; name: string; text: string; colors: string[] };

const PHRASES: Phrase[] = [
  { code: "es", name: "Spanish", text: "Hola, ¿cómo estás?", colors: ["#F8D5D7", "#F0A8AA", "#F0F5D7"] },
  { code: "ca", name: "Catalan", text: "Hola, com estàs?", colors: ["#E3EAAE", "#F0A8AA", "#FEFDFB"] },
  { code: "en", name: "English", text: "Hello, how are you?", colors: ["#C9E6BA", "#F0F5D7", "#BBC994"] },
  { code: "ru", name: "Russian", text: "Привет, как дела?", colors: ["#F0F5D7", "#C9E6BA", "#F8D5D7"] },
];

type Props = { phrases?: Phrase[]; duration?: number; hold?: number };

export default function LanguageMorph({ phrases = PHRASES, duration = 2.6, hold = 1.8 }: Props) {
  const [step, setStep] = useState(0);
  const [colors, setColors] = useState(phrases[0].colors);
  const current = phrases[step % phrases.length];
  const next = phrases[(step + 1) % phrases.length];

  return (
    <figure className="morph-showcase">
      <FluidBackdrop colors={colors} duration={duration} />
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
        duration={duration}
        delay={hold}
        onStart={() => setColors(next.colors)}
        onComplete={() => setStep(s => s + 1)}
      />
    </figure>
  );
}
