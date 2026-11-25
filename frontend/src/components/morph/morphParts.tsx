import { splitWords, type MorphStep } from "../../lib/morphPlan";

export function Measure({ text, layer, lang }: { text: string; layer: "from" | "to"; lang?: string }) {
  const words = splitWords(text);
  return (
    <div className="morph__measure" data-layer={layer} lang={lang} aria-hidden="true">
      {words.map((word, w) => (
        <span key={w}>
          <span className="morph__word">
            {word.chars.map(c => (
              <span key={c.index} className="morph__cell" data-i={c.index}>{c.char}</span>
            ))}
          </span>
          {w < words.length - 1 ? " " : null}
        </span>
      ))}
    </div>
  );
}

export function Glyph({ step }: { step: MorphStep }) {
  if (step.kind === "morph") {
    return (
      <span className="morph__glyph" data-kind="morph" data-from={step.from} data-to={step.to}>
        <span className="morph__old">{step.oldChar}</span>
        <span className="morph__new">{step.newChar}</span>
      </span>
    );
  }
  return (
    <span
      className="morph__glyph"
      data-kind={step.kind}
      data-from={"from" in step ? step.from : undefined}
      data-to={"to" in step ? step.to : undefined}
    >
      {step.char}
    </span>
  );
}
