import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

type Props = {
  from: string;
  to: string;
  fromColor?: string;
  toColor?: string;
  duration?: number;
  delay?: number;
  fromLang?: string;
  toLang?: string;
  className?: string;
  onComplete?: () => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function Line({ text, layer, lang }: { text: string; layer: "from" | "to"; lang?: string }) {
  return (
    <span className="liquid__line" data-layer={layer} lang={lang}>
      {[...text].map((char, i) => (
        <span key={i} className="liquid__char">{char}</span>
      ))}
    </span>
  );
}

export default function LiquidMorph({
  from, to, fromColor, toColor, duration = 2.2, delay = 0, fromLang, toLang, className, onComplete,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const filterId = `liquid-${useId().replace(/:/g, "")}`;
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
    const stack = el.querySelector<HTMLElement>(".liquid__stack")!;
    const pill = el.querySelector<HTMLElement>(".liquid__pill")!;
    const matrix = el.querySelector<SVGFEColorMatrixElement>("feColorMatrix")!;
    const line = (name: "from" | "to") => el.querySelector<HTMLElement>(`[data-layer="${name}"]`)!;
    const chars = (name: "from" | "to") => gsap.utils.toArray<HTMLElement>(".liquid__char", line(name));

    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 40;
    const padX = fontSize * 0.55;
    const pillWidth = (name: "from" | "to") => line(name).offsetWidth + padX * 2;
    const reduced = prefersReducedMotion();
    const D = reduced ? 0.5 : duration;
    const drop = reduced ? 0 : fontSize * 0.42;
    const blur = reduced ? "blur(0px)" : `blur(${(fontSize * 0.11).toFixed(1)}px)`;
    const goo = { t: 0 };
    const applyGoo = () => {
      matrix.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${1 + 17 * goo.t} ${-7 * goo.t}`);
    };

    const ctx = gsap.context(() => {
      gsap.set(pill, { width: pillWidth("from"), backgroundColor: fromColor ?? "transparent" });
      gsap.set(chars("from"), { opacity: 1, y: 0, scaleY: 1, filter: "blur(0px)" });
      gsap.set(chars("to"), { opacity: 0 });
      if (from === to) return;

      const tl = gsap.timeline({
        delay,
        onStart: () => { if (!reduced) stack.style.filter = `url(#${filterId})`; },
        onComplete: () => {
          stack.style.filter = "";
          finished.current?.();
        },
      });

      const stagger = { amount: D * 0.32, ease: "sine.inOut" };
      tl.to(goo, { t: 1, duration: D * 0.3, ease: "sine.out", onUpdate: applyGoo }, 0);
      tl.to(goo, { t: 0, duration: D * 0.3, ease: "sine.in", onUpdate: applyGoo }, D * 0.7);

      tl.to(chars("from"), {
        y: drop,
        scaleY: 1.55,
        opacity: 0,
        filter: blur,
        transformOrigin: "50% 0%",
        duration: D * 0.5,
        ease: "power2.in",
        stagger,
      }, 0);

      tl.fromTo(chars("to"), {
        y: -drop,
        scaleY: 1.55,
        opacity: 0,
        filter: blur,
        transformOrigin: "50% 100%",
      }, {
        y: 0,
        scaleY: 1,
        opacity: 1,
        filter: "blur(0px)",
        duration: D * 0.58,
        ease: "power3.out",
        stagger,
      }, D * 0.22);

      tl.to(pill, {
        width: pillWidth("to"),
        backgroundColor: toColor ?? "transparent",
        duration: D * 0.75,
        ease: "power3.inOut",
      }, D * 0.12);
    }, el);

    return () => {
      ctx.revert();
      stack.style.filter = "";
    };
  }, [from, to, fromColor, toColor, duration, delay, filterId, layoutVersion]);

  return (
    <div ref={root} className={["liquid", className].filter(Boolean).join(" ")}>
      <span className="visually-hidden" lang={fromLang}>{from}</span>
      <svg className="liquid__defs" aria-hidden="true" focusable="false">
        <filter id={filterId} x="-10%" y="-60%" width="120%" height="220%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
        </filter>
      </svg>
      <span className="liquid__pill" aria-hidden="true" />
      <span className="liquid__stack" aria-hidden="true">
        <Line text={from} layer="from" lang={fromLang} />
        <Line text={to} layer="to" lang={toLang} />
      </span>
    </div>
  );
}
