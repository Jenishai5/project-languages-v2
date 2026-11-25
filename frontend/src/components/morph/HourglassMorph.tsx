import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
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

gsap.registerPlugin(MotionPathPlugin);

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
    const stage = el.querySelector<HTMLElement>(".morph__stage")!;
    const blobLayer = el.querySelector<HTMLElement>(".morph__blobs")!;
    const stream = el.querySelector<HTMLElement>(".hourglass__stream")!;
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
    const down = (b: Box): Box => ({ ...b, y: b.y + bottomTop });
    const atNeck = (b: Box): Box => ({ ...b, x: neck.x - b.w / 2, y: neck.y - b.h / 2 });
    const blobBox = (b: Box) => ({ x: b.x - padX, y: b.y - padY, width: b.w + padX * 2, height: b.h + padY * 2 });

    const ctx = gsap.context(() => {
      gsap.set(el, { height: lineH * 2 + gap });
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
          return (it.start ? 0 : 10000) + Math.abs(ref.x + ref.w / 2 - neck.x);
        };
        return rank(a) - rank(b);
      });

      const streamWidth = fontSize * 0.22;
      gsap.set(stream, {
        x: neck.x - streamWidth / 2,
        y: lineH * 0.55,
        width: streamWidth,
        height: bottomTop - lineH * 0.1,
        scaleY: 0,
        transformOrigin: "50% 0%",
      });

      const tl = gsap.timeline({
        delay,
        onStart: () => { if (!reduced) stage.style.filter = `url(#${id}-text)`; },
        onComplete: () => {
          stage.style.filter = "";
          finished.current?.();
        },
      });

      const spread = D * 0.5;
      const travel = D * 0.5;
      const half = travel / 2;
      const follow = D * 0.035;
      const pourEnd = spread + travel;

      tl.to(blobLayer, { color: toColor, duration: D * 0.8, ease: "sine.inOut" }, D * 0.1);
      tl.to(textBlur, { attr: { stdDeviation: reduced ? 0 : fontSize * 0.03 }, duration: D * 0.4, ease: "sine.inOut" }, 0);
      tl.to(textBlur, { attr: { stdDeviation: 0 }, duration: D * 0.4, ease: "sine.inOut" }, pourEnd - D * 0.3);
      if (!reduced) {
        tl.to(stream, { scaleY: 1, duration: D * 0.3, ease: "power2.in" }, half * 0.6);
        tl.set(stream, { transformOrigin: "50% 100%" }, pourEnd - half * 1.2);
        tl.to(stream, { scaleY: 0, duration: D * 0.25, ease: "power2.inOut" }, pourEnd - half * 1.2);
      }

      const curve = (a: Box, b: Box, toward: number) => ({
        x: a.x + (b.x - a.x) * toward,
        y: a.y + (b.y - a.y) * 0.6,
      });
      const pathThrough = (points: { x: number; y: number }[]) => ({ path: points, curviness: 1.3 });
      const shift = (b: { x: number; y: number }, dx: number, dy: number) => ({ x: b.x + dx, y: b.y + dy });

      order.forEach((it, k) => {
        const t = order.length > 1 ? (k / (order.length - 1)) * spread : 0;
        const { g, blob, start, end } = it;
        const bx = -padX;
        const by = -padY;

        if (it.kind === "keep" || it.kind === "morph") {
          const s = start!;
          const e = down(end!);
          const n = atNeck(e);
          const sb = blobBox(s);
          const eb = blobBox(e);
          const points = [s, curve(s, n, 0.3), n, curve(e, n, 0.3), e];
          gsap.set(g, { x: s.x, y: s.y });
          gsap.set(blob, sb);
          tl.to(g, { motionPath: pathThrough(points), duration: travel, ease: "power1.inOut" }, t);
          tl.to(g, { scaleX: 0.5, scaleY: 1.35, duration: half, ease: "sine.in" }, t);
          tl.to(g, { scaleX: 1, scaleY: 1, duration: half, ease: "sine.out" }, t + half);
          tl.to(blob, { width: eb.width, height: eb.height, duration: travel, ease: "power1.inOut" }, t + follow);
          tl.to(blob, { motionPath: pathThrough(points.map(p => shift(p, bx, by))), duration: travel, ease: "power1.inOut" }, t + follow);
          tl.to(blob, { scaleX: 0.3, scaleY: 1.1, duration: half, ease: "sine.in" }, t + follow);
          tl.to(blob, { scaleX: 1, scaleY: 1, duration: half, ease: "sine.out" }, t + follow + half);
          if (it.kind === "morph") {
            const oldGlyph = g.querySelector(".morph__old");
            const newGlyph = g.querySelector(".morph__new");
            gsap.set(newGlyph, { opacity: 0, filter: "blur(3px)" });
            tl.to(oldGlyph, { opacity: 0, filter: "blur(3px)", duration: half * 0.6, ease: "power1.in" }, t + half * 0.7);
            tl.to(newGlyph, { opacity: 1, filter: "blur(0px)", duration: half * 0.8, ease: "power2.out" }, t + half * 1.05);
          }
        } else if (it.kind === "remove") {
          const s = start!;
          const n = { ...s, x: neck.x - s.w / 2, y: neck.y - s.h / 2 };
          const points = [s, curve(s, n, 0.3), n];
          gsap.set(g, { x: s.x, y: s.y });
          gsap.set(blob, blobBox(s));
          tl.to(g, { motionPath: pathThrough(points), scaleX: 0.3, scaleY: 1.2, opacity: 0, duration: half * 1.1, ease: "power1.in" }, t);
          tl.to(blob, { motionPath: pathThrough(points.map(p => shift(p, bx, by))), scaleX: 0.2, scaleY: 0.6, duration: half * 1.1, ease: "power1.in" }, t + follow);
          tl.to(blob, { scale: 0, duration: half * 0.3, ease: "power1.in" }, t + follow + half * 1.1);
        } else {
          const e = down(end!);
          const n = atNeck(e);
          const points = [n, curve(e, n, 0.3), e];
          gsap.set(g, { x: n.x, y: n.y, scaleX: 0.3, scaleY: 1.2, opacity: 0 });
          gsap.set(blob, { ...blobBox(n), scaleX: 0.2, scaleY: 0.6 });
          tl.to(g, { motionPath: pathThrough(points), scaleX: 1, scaleY: 1, opacity: 1, duration: half * 1.2, ease: "power2.out" }, t + half);
          tl.to(blob, { motionPath: pathThrough(points.map(p => shift(p, bx, by))), scaleX: 1, scaleY: 1, duration: half * 1.2, ease: "power2.out" }, t + half + follow);
        }
      });

      const riseAt = pourEnd + D * 0.35;
      const rise = reduced ? 0.01 : 1.2;
      items.forEach(({ g, blob, end }) => {
        if (!end) return;
        tl.to(g, { y: end.y, duration: rise, ease: "power3.inOut" }, riseAt);
        tl.to(blob, { y: end.y - padY, duration: rise, ease: "power3.inOut" }, riseAt + follow);
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
      <Measure text={from} layer="from" lang={fromLang} />
      <Measure text={to} layer="to" lang={toLang} />
      <div className="morph__blobs" aria-hidden="true" style={{ filter: `url(#${id}-blob)` }}>
        <span className="hourglass__stream" />
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
