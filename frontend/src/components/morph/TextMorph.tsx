import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { planMorph, splitWords, type MorphStep } from "../../lib/morphPlan";

type Props = {
  from: string;
  to: string;
  duration?: number;
  delay?: number;
  fromLang?: string;
  toLang?: string;
  fromColor?: string;
  toColor?: string;
  className?: string;
  onStart?: () => void;
  onComplete?: () => void;
};

type Point = { x: number; y: number; w: number; h: number };

function Measure({ text, layer, lang }: { text: string; layer: "from" | "to"; lang?: string }) {
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

function Glyph({ step }: { step: MorphStep }) {
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

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export default function TextMorph({ from, to, duration = 2.6, delay = 0, fromLang, toLang, fromColor, toColor, className, onStart, onComplete }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const filterId = `morph-goo-${useId().replace(/:/g, "")}`;
  const steps = useMemo(() => planMorph(from, to), [from, to]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const started = useRef(onStart);
  const finished = useRef(onComplete);

  useEffect(() => {
    started.current = onStart;
    finished.current = onComplete;
  });

  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth !== width) {
        width = el.offsetWidth;
        setLayoutVersion(v => v + 1);
      }
    });
    observer.observe(el);
    document.fonts?.ready.then(() => setLayoutVersion(v => v + 1));
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const stage = el.querySelector<HTMLElement>(".morph__stage")!;
    const blur = el.querySelector<SVGFEGaussianBlurElement>(".morph__text-blur")!;
    const matrix = el.querySelector<SVGFEColorMatrixElement>(".morph__text-matrix")!;
    const layer = (name: "from" | "to") => el.querySelector<HTMLElement>(`[data-layer="${name}"]`)!;
    const point = (name: "from" | "to", index: string | undefined): Point | null => {
      if (index === undefined) return null;
      const cell = layer(name).querySelector<HTMLElement>(`[data-i="${index}"]`);
      return cell ? { x: cell.offsetLeft, y: cell.offsetTop, w: cell.offsetWidth, h: cell.offsetHeight } : null;
    };

    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 40;
    const width = el.offsetWidth || 1;
    const still = from === to;
    const reduced = prefersReducedMotion();
    const D = reduced ? 0.6 : duration;
    const wave = reduced ? 0 : D * 0.2;
    const move = D * 0.62;
    const blurPeak = reduced ? 0 : fontSize * 0.05;
    const liquid = { t: 0 };
    const applyLiquid = () => {
      blur.setAttribute("stdDeviation", String(liquid.t * blurPeak));
      matrix.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${1 + 11 * liquid.t} ${-4.5 * liquid.t}`);
    };

    const ctx = gsap.context(() => {
      gsap.set(el, { height: layer(still ? "to" : "from").offsetHeight });
      const glyphs = gsap.utils.toArray<HTMLElement>(".morph__glyph", el);
      const blobs = gsap.utils.toArray<HTMLElement>(".morph__blob", el);
      const padX = fontSize * 0.32;
      const padY = fontSize * 0.2;
      const box = (p: Point) => ({ x: p.x - padX, y: p.y - padY, width: p.w + padX * 2, height: p.h + padY * 2 });
      const blobLayer = el.querySelector<HTMLElement>(".morph__blobs");
      if (blobLayer) gsap.set(blobLayer, { color: still ? toColor : fromColor });

      if (still) {
        glyphs.forEach((g, i) => {
          const p = point("to", g.dataset.to)!;
          gsap.set(g, { x: p.x, y: p.y, opacity: 1 });
          if (blobs[i]) gsap.set(blobs[i], box(p));
        });
        return;
      }

      const tl = gsap.timeline({
        delay,
        onStart: () => {
          stage.style.filter = reduced ? "" : `url(#${filterId})`;
          started.current?.();
        },
        onComplete: () => {
          stage.style.filter = "";
          finished.current?.();
        },
      });

      tl.to(el, { height: layer("to").offsetHeight, duration: move, ease: "power2.inOut" }, D * 0.1);
      if (blobLayer) tl.to(blobLayer, { color: toColor, duration: D * 0.8, ease: "sine.inOut" }, D * 0.1);
      tl.to(liquid, { t: 1, duration: D * 0.45, ease: "sine.inOut", onUpdate: applyLiquid }, 0);
      tl.to(liquid, { t: 0, duration: D * 0.45, ease: "sine.inOut", onUpdate: applyLiquid }, D * 0.52);

      glyphs.forEach((g, i) => {
        const blob = blobs[i];
        const follow = D * 0.05;
        const start = point("from", g.dataset.from);
        const end = point("to", g.dataset.to);
        const anchor = end ?? start!;
        const offset = wave * Math.min(1, Math.max(0, anchor.x / width));
        const travel = { duration: move, ease: "expo.inOut" };

        switch (g.dataset.kind) {
          case "keep":
            gsap.set(g, { x: start!.x, y: start!.y });
            tl.to(g, { x: end!.x, y: end!.y, ...travel }, D * 0.08 + offset);
            if (blob) {
              gsap.set(blob, box(start!));
              tl.to(blob, { ...box(end!), duration: move, ease: "power3.inOut" }, D * 0.08 + offset + follow);
            }
            break;
          case "morph": {
            const oldGlyph = g.querySelector(".morph__old");
            const newGlyph = g.querySelector(".morph__new");
            gsap.set(g, { x: start!.x, y: start!.y });
            gsap.set(newGlyph, { opacity: 0, scaleX: 1.25, scaleY: 0.6, filter: "blur(3px)" });
            tl.to(g, { x: end!.x, y: end!.y, ...travel }, D * 0.08 + offset);
            if (blob) {
              gsap.set(blob, box(start!));
              tl.to(blob, { ...box(end!), duration: move, ease: "power3.inOut" }, D * 0.08 + offset + follow);
            }
            tl.to(oldGlyph, { opacity: 0, scaleX: 0.75, scaleY: 1.3, filter: "blur(3px)", duration: D * 0.5, ease: "power1.in" }, D * 0.14 + offset);
            tl.to(newGlyph, { opacity: 1, scaleX: 1, scaleY: 1, filter: "blur(0px)", duration: D * 0.5, ease: "power2.out" }, D * 0.26 + offset);
            break;
          }
          case "remove":
            gsap.set(g, { x: start!.x, y: start!.y });
            tl.to(g, { opacity: 0, scaleX: 1.3, scaleY: 0.2, y: start!.y + fontSize * 0.18, filter: "blur(4px)", duration: D * 0.45, ease: "power1.in" }, D * 0.1 + offset);
            if (blob) {
              gsap.set(blob, box(start!));
              tl.to(blob, { scale: 0, duration: D * 0.5, ease: "power2.in" }, D * 0.1 + offset + follow);
            }
            break;
          case "add":
            gsap.set(g, { x: end!.x, y: end!.y - fontSize * 0.18, opacity: 0, scaleX: 1.3, scaleY: 0.2, filter: "blur(4px)" });
            tl.to(g, { y: end!.y, opacity: 1, scaleX: 1, scaleY: 1, filter: "blur(0px)", duration: D * 0.45, ease: "power2.out" }, D * 0.32 + offset);
            if (blob) {
              gsap.set(blob, { ...box(end!), scale: 0 });
              tl.to(blob, { scale: 1, duration: D * 0.5, ease: "power2.out" }, D * 0.28 + offset);
            }
            break;
        }
      });
    }, el);

    return () => {
      ctx.revert();
      stage.style.filter = "";
    };
  }, [steps, layoutVersion, duration, delay, filterId, from, to, fromColor, toColor]);

  return (
    <div ref={root} className={["morph", className].filter(Boolean).join(" ")}>
      <span className="visually-hidden" lang={fromLang}>{from}</span>
      <svg className="morph__defs" aria-hidden="true" focusable="false">
        <filter id={filterId} x="-20%" y="-40%" width="140%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur className="morph__text-blur" in="SourceGraphic" stdDeviation="0" />
          <feColorMatrix className="morph__text-matrix" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
        </filter>
        <filter id={`${filterId}-blob`} x="-10%" y="-30%" width="120%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
        </filter>
      </svg>
      <Measure text={from} layer="from" lang={fromLang} />
      <Measure text={to} layer="to" lang={toLang} />
      {fromColor ? (
        <div className="morph__blobs" aria-hidden="true" style={{ filter: `url(#${filterId}-blob)` }}>
          {steps.map((_, i) => <span key={i} className="morph__blob" />)}
        </div>
      ) : null}
      <div className="morph__stage" aria-hidden="true">
        {steps.map(step => (
          <Glyph key={`${step.kind}-${"from" in step ? step.from : ""}-${"to" in step ? step.to : ""}`} step={step} />
        ))}
      </div>
    </div>
  );
}
