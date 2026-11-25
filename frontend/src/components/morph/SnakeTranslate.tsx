import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";

type Phrase = { code: string; name: string; text: string };
type Pair = [Phrase, Phrase];

const ES: Phrase = { code: "es", name: "Spanish", text: "Hola, ¿cómo estás?" };
const CA: Phrase = { code: "ca", name: "Catalan", text: "Hola, com estàs?" };
const EN: Phrase = { code: "en", name: "English", text: "Hello, how are you?" };
const RU: Phrase = { code: "ru", name: "Russian", text: "Привет, как дела?" };

const PAIRS: Pair[] = [[ES, CA], [EN, RU], [CA, EN], [RU, ES]];

type Props = { pairs?: Pair[] };

type Mover = {
  state: { left: number; amp: number };
  width: number;
  render: () => void;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function Line({ phrase, pair, role }: { phrase: Phrase; pair: number; role: "src" | "tgt" }) {
  return (
    <span className="snake__line" data-pair={pair} data-role={role} lang={phrase.code}>
      {[...phrase.text].map((char, i) => (
        <span key={i} className="snake__char">{char}</span>
      ))}
    </span>
  );
}

export default function SnakeTranslate({ pairs = PAIRS }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

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
    const reduced = prefersReducedMotion();
    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 40;
    const width = el.offsetWidth;
    const wallWidth = Math.max(10, fontSize * 0.22);
    const wallX = width / 2;
    const leftWidth = wallX - wallWidth / 2;
    const rightOrigin = wallX + wallWidth / 2;
    const rightWidth = width - rightOrigin;
    const amplitude = reduced ? 0 : fontSize * 0.3;
    const wavelength = fontSize * 3.4;
    const leftClip = el.querySelector<HTMLElement>(".snake__clip--left")!;
    const rightClip = el.querySelector<HTMLElement>(".snake__clip--right")!;
    const wall = el.querySelector<HTMLElement>(".snake__wall")!;
    const glow = el.querySelector<HTMLElement>(".snake__glow")!;

    const mover = (line: HTMLElement, origin: number): Mover => {
      const chars = gsap.utils.toArray<HTMLElement>(".snake__char", line);
      const centers = chars.map(c => c.offsetLeft + c.offsetWidth / 2);
      const state = { left: 0, amp: 0 };
      const render = () => {
        line.style.transform = `translateX(${state.left}px)`;
        chars.forEach((c, i) => {
          const phase = ((origin + state.left + centers[i]) / wavelength) * Math.PI * 2;
          const y = state.amp * Math.sin(phase);
          const slope = state.amp * ((Math.PI * 2) / wavelength) * Math.cos(phase);
          c.style.transform = `translateY(${y.toFixed(2)}px) rotate(${(Math.atan(slope) * 57.3 * 0.8).toFixed(2)}deg)`;
        });
      };
      return { state, width: line.offsetWidth, render };
    };

    const ctx = gsap.context(() => {
      gsap.set(leftClip, { width: leftWidth });
      gsap.set(rightClip, { left: rightOrigin, width: rightWidth });
      gsap.set(wall, { left: wallX - wallWidth / 2, width: wallWidth });

      const movers = pairs.map((_, i) => ({
        src: mover(el.querySelector<HTMLElement>(`[data-pair="${i}"][data-role="src"]`)!, 0),
        tgt: mover(el.querySelector<HTMLElement>(`[data-pair="${i}"][data-role="tgt"]`)!, rightOrigin),
      }));
      const labels = (i: number, side: "src" | "tgt") =>
        el.querySelector<HTMLElement>(`.snake__label[data-pair="${i}"][data-role="${side}"]`)!;

      const inTime = 1.5;
      const pause = 0.9;
      const cross = 2.8;
      const rest = 1.8;
      const outTime = 1.5;
      const cycle = inTime + pause + cross + rest;
      const tl = gsap.timeline({ repeat: -1 });

      const slither = (m: Mover, from: number, to: number, at: number, duration: number, ease: string) => {
        tl.fromTo(m.state, { left: from }, { left: to, duration, ease, onUpdate: m.render, immediateRender: false }, at);
        tl.fromTo(m.state, { amp: 0 }, { amp: amplitude, duration: duration * 0.4, ease: "sine.out", onUpdate: m.render, immediateRender: false }, at);
        tl.fromTo(m.state, { amp: amplitude }, { amp: 0, duration: duration * 0.4, ease: "sine.inOut", onUpdate: m.render, immediateRender: false }, at + duration * 0.6);
      };
      const fade = (target: HTMLElement, show: boolean, at: number) =>
        tl.fromTo(target, { autoAlpha: show ? 0 : 1 }, { autoAlpha: show ? 1 : 0, duration: 0.5, ease: "sine.inOut", immediateRender: false }, at);

      movers.forEach(({ src, tgt }, i) => {
        const at = i * cycle;
        const srcHidden = -src.width - fontSize;
        const srcRest = (leftWidth - src.width) / 2;
        const srcGone = leftWidth + fontSize * 0.2;
        const tgtHidden = -tgt.width - fontSize * 0.2;
        const tgtRest = (rightWidth - tgt.width) / 2;
        const tgtGone = rightWidth + fontSize;
        const crossAt = at + inTime + pause;
        const last = i === movers.length - 1;
        const exitAt = last ? 0 : crossAt + cross + rest;

        src.state.left = srcHidden;
        tgt.state.left = last ? tgtRest : tgtHidden;
        src.render();
        tgt.render();
        gsap.set(labels(i, "src"), { autoAlpha: 0 });
        gsap.set(labels(i, "tgt"), { autoAlpha: last ? 1 : 0 });

        slither(src, srcHidden, srcRest, at, inTime, "power2.out");
        fade(labels(i, "src"), true, at + inTime * 0.4);
        slither(src, srcRest, srcGone, crossAt, cross, "power1.inOut");
        fade(labels(i, "src"), false, crossAt + cross * 0.4);
        slither(tgt, tgtHidden, tgtRest, crossAt, cross, "power1.inOut");
        fade(labels(i, "tgt"), true, crossAt + cross * 0.5);
        tl.fromTo(glow, { opacity: 0, scaleY: 0.7 }, { opacity: 1, scaleY: 1, duration: cross * 0.5, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }, crossAt);
        slither(tgt, tgtRest, tgtGone, exitAt, outTime, "power2.in");
        fade(labels(i, "tgt"), false, exitAt);
      });
    }, el);

    return () => ctx.revert();
  }, [pairs, layoutVersion]);

  return (
    <figure ref={root} className="snake">
      <figcaption className="visually-hidden">
        {pairs.map(([a, b]) => `${a.name} “${a.text}” becomes ${b.name} “${b.text}”`).join(". ")}
      </figcaption>
      <div className="snake__clip snake__clip--left" aria-hidden="true">
        {pairs.map(([a], i) => <Line key={i} phrase={a} pair={i} role="src" />)}
      </div>
      <div className="snake__clip snake__clip--right" aria-hidden="true">
        {pairs.map(([, b], i) => <Line key={i} phrase={b} pair={i} role="tgt" />)}
      </div>
      <span className="snake__wall" aria-hidden="true">
        <span className="snake__glow" />
      </span>
      <div className="snake__labels" aria-hidden="true">
        {pairs.map(([a, b], i) => (
          <span key={i}>
            <span className="snake__label snake__label--left" data-pair={i} data-role="src">{a.name}</span>
            <span className="snake__label snake__label--right" data-pair={i} data-role="tgt">{b.name}</span>
          </span>
        ))}
      </div>
    </figure>
  );
}
