import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { planMorph } from "../../lib/morphPlan";
import { Glyph, Measure } from "./morphParts";

type Props = {
  from: string;
  to: string;
  fromColor: string;
  toColor: string;
  duration?: number;
  delay?: number;
  fromLang?: string;
  toLang?: string;
  className?: string;
  onComplete?: () => void;
};

type Box = { x: number; y: number; w: number; h: number };

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export default function HourglassMorph({
  from, to, fromColor, toColor, duration = 3.4, delay = 0, fromLang, toLang, className, onComplete,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const id = `hourglass-${useId().replace(/:/g, "")}`;
  const steps = useMemo(() => planMorph(from, to), [from, to]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const finished = useRef(onComplete);

  useEffect(() => {
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
    const layer = (name: "from" | "to") => el.querySelector<HTMLElement>(`[data-layer="${name}"]`)!;
    const cell = (name: "from" | "to", index: string | undefined): Box | null => {
      if (index === undefined) return null;
      const c = layer(name).querySelector<HTMLElement>(`[data-i="${index}"]`);
      return c ? { x: c.offsetLeft, y: c.offsetTop, w: c.offsetWidth, h: c.offsetHeight } : null;
    };
    const textWidth = (name: "from" | "to") => {
      const cells = Array.from(layer(name).querySelectorAll<HTMLElement>(".morph__cell"));
      if (!cells.length) return 0;
      return Math.max(...cells.map(c => c.offsetLeft + c.offsetWidth)) - Math.min(...cells.map(c => c.offsetLeft));
    };

    const stage = el.querySelector<HTMLElement>(".morph__stage")!;
    const blobLayer = el.querySelector<HTMLElement>(".morph__blobs")!;
    const outline = el.querySelector<SVGSVGElement>(".hourglass__outline")!;
    const textBlur = el.querySelector<SVGFEGaussianBlurElement>(".morph__text-blur")!;

    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 40;
    const reduced = prefersReducedMotion();
    const D = reduced ? 0.8 : duration;
    const padX = fontSize * 0.32;
    const padY = fontSize * 0.2;
    const lineH = Math.max(layer("from").offsetHeight, layer("to").offsetHeight);
    const gap = fontSize * 3.2;
    const bottomTop = lineH + gap;
    const neck = { x: el.offsetWidth / 2, y: lineH + gap / 2 };
    const bulbWidth = Math.max(textWidth("from"), textWidth("to")) + padX * 4;
    const down = (b: Box): Box => ({ ...b, y: b.y + bottomTop });
    const atNeck = (b: Box): Box => ({ ...b, x: neck.x - b.w / 2, y: neck.y - b.h / 2 });
    const blobBox = (b: Box) => ({ x: b.x - padX, y: b.y - padY, width: b.w + padX * 2, height: b.h + padY * 2 });

    const ctx = gsap.context(() => {
      gsap.set(el, { height: lineH * 2 + gap });
      gsap.set(outline, { width: bulbWidth, height: lineH * 2 + gap + padY * 4, x: -bulbWidth / 2, y: -padY * 2, rotation: 0 });
      gsap.set(blobLayer, { color: fromColor });

      const glyphs = gsap.utils.toArray<HTMLElement>(".morph__glyph", el);
      const blobs = gsap.utils.toArray<HTMLElement>(".morph__blob", el);
      const items = glyphs.map((g, i) => ({
        g,
        blob: blobs[i],
        kind: g.dataset.kind,
        start: cell("from", g.dataset.from),
        end: cell("to", g.dataset.to),
      }));

      const order = [...items].sort((a, b) => {
        const rank = (it: typeof a) => {
          const ref = it.start ?? it.end!;
          const base = it.start ? 0 : 10000;
          return base + Math.abs(ref.x + ref.w / 2 - neck.x);
        };
        return rank(a) - rank(b);
      });

      const tl = gsap.timeline({
        delay,
        onStart: () => { if (!reduced) stage.style.filter = `url(#${id}-text)`; },
        onComplete: () => {
          stage.style.filter = "";
          finished.current?.();
        },
      });

      const spread = D * 0.45;
      const fall = D * 0.28;
      const rise = D * 0.3;
      const follow = D * 0.04;

      tl.to(blobLayer, { color: toColor, duration: D * 0.7, ease: "sine.inOut" }, D * 0.15);
      tl.to(textBlur, { attr: { stdDeviation: reduced ? 0 : fontSize * 0.035 }, duration: D * 0.4, ease: "sine.inOut" }, 0);
      tl.to(textBlur, { attr: { stdDeviation: 0 }, duration: D * 0.4, ease: "sine.inOut" }, D * 0.6);

      order.forEach((it, k) => {
        const t = order.length > 1 ? (k / (order.length - 1)) * spread : 0;
        const { g, blob, start, end } = it;

        if (it.kind === "keep" || it.kind === "morph") {
          const s = start!;
          const e = down(end!);
          const n = atNeck(e);
          gsap.set(g, { x: s.x, y: s.y, scale: 1, opacity: 1 });
          gsap.set(blob, { ...blobBox(s), scale: 1 });
          tl.to(g, { x: n.x, y: n.y, scale: 0.5, duration: fall, ease: "power2.in" }, t);
          tl.to(g, { x: e.x, y: e.y, scale: 1, duration: rise, ease: "power3.out" }, t + fall);
          tl.to(blob, { ...blobBox(atNeck(s)), scale: 0.35, duration: fall, ease: "power2.in" }, t + follow);
          tl.to(blob, { ...blobBox(e), scale: 1, duration: rise, ease: "power3.out" }, t + fall + follow);
          if (it.kind === "morph") {
            const oldGlyph = g.querySelector(".morph__old");
            const newGlyph = g.querySelector(".morph__new");
            gsap.set(newGlyph, { opacity: 0, scaleY: 0.6, filter: "blur(3px)" });
            tl.to(oldGlyph, { opacity: 0, scaleY: 1.4, filter: "blur(3px)", duration: fall * 0.6, ease: "power1.in" }, t + fall * 0.55);
            tl.to(newGlyph, { opacity: 1, scaleY: 1, filter: "blur(0px)", duration: rise * 0.7, ease: "power2.out" }, t + fall * 0.85);
          }
        } else if (it.kind === "remove") {
          const s = start!;
          const n = atNeck(s);
          gsap.set(g, { x: s.x, y: s.y, scale: 1, opacity: 1 });
          gsap.set(blob, { ...blobBox(s), scale: 1 });
          tl.to(g, { x: n.x, y: n.y, scale: 0.2, opacity: 0, duration: fall, ease: "power2.in" }, t);
          tl.to(blob, { ...blobBox(n), scale: 0, duration: fall, ease: "power2.in" }, t + follow);
        } else {
          const e = down(end!);
          const n = atNeck(e);
          gsap.set(g, { x: n.x, y: n.y, scale: 0.2, opacity: 0 });
          gsap.set(blob, { ...blobBox(n), scale: 0 });
          tl.to(g, { x: e.x, y: e.y, scale: 1, opacity: 1, duration: rise, ease: "power3.out" }, t + fall * 0.6);
          tl.to(blob, { ...blobBox(e), scale: 1, duration: rise, ease: "power3.out" }, t + fall * 0.6 + follow);
        }
      });

      const flipAt = spread + fall + rise + D * 0.35;
      const flip = reduced ? 0.01 : 1.1;
      tl.to(outline, { rotation: 180, duration: flip, ease: "power3.inOut" }, flipAt);
      items.forEach(({ g, blob, end }) => {
        if (!end) return;
        tl.to(g, { y: end.y, duration: flip, ease: "power3.inOut" }, flipAt);
        tl.to(blob, { y: end.y - padY, duration: flip, ease: "power3.inOut" }, flipAt + follow);
      });
    }, el);

    return () => {
      ctx.revert();
      stage.style.filter = "";
    };
  }, [steps, layoutVersion, duration, delay, id, fromColor, toColor]);

  return (
    <div ref={root} className={["morph", "hourglass", className].filter(Boolean).join(" ")}>
      <span className="visually-hidden" lang={fromLang}>{from}</span>
      <svg className="morph__defs" aria-hidden="true" focusable="false">
        <filter id={`${id}-text`} x="-20%" y="-40%" width="140%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur className="morph__text-blur" in="SourceGraphic" stdDeviation="0" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 12 -5" />
        </filter>
        <filter id={`${id}-blob`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="10" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
        </filter>
      </svg>
      <svg className="hourglass__outline" viewBox="0 0 100 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path
          d="M2 2 H98 C98 60 56 84 52 100 C56 116 98 140 98 198 H2 C2 140 44 116 48 100 C44 84 2 60 2 2 Z"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Measure text={from} layer="from" lang={fromLang} />
      <Measure text={to} layer="to" lang={toLang} />
      <div className="morph__blobs" aria-hidden="true" style={{ filter: `url(#${id}-blob)` }}>
        {steps.map((_, i) => <span key={i} className="morph__blob" />)}
      </div>
      <div className="morph__stage" aria-hidden="true">
        {steps.map(step => (
          <Glyph key={`${step.kind}-${"from" in step ? step.from : ""}-${"to" in step ? step.to : ""}`} step={step} />
        ))}
      </div>
    </div>
  );
}
