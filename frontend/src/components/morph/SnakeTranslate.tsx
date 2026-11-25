import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";

type Phrase = { code: string; name: string; text: string };
type Pair = [Phrase, Phrase];

const ES: Phrase = { code: "es", name: "Spanish", text: "Hola, ¿cómo estás?" };
const CA: Phrase = { code: "ca", name: "Catalan", text: "Hola, com estàs?" };
const EN: Phrase = { code: "en", name: "English", text: "Hello, how are you?" };
const RU: Phrase = { code: "ru", name: "Russian", text: "Привет, как дела?" };

const PAIRS: Pair[] = [[ES, CA], [EN, RU], [CA, EN], [RU, ES]];
const LAPS = 2;

type Props = { pairs?: Pair[]; speed?: number; wave?: number };

type Track = {
  line: HTMLElement;
  chars: HTMLElement[];
  centers: number[];
  width: number;
};

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function Line({ phrase, index, role }: { phrase: Phrase; index: number; role: "src" | "tgt" }) {
  return (
    <span className="snake__line" data-index={index} data-role={role} lang={phrase.code}>
      {[...phrase.text].map((char, i) => (
        <span key={i} className="snake__char">{char}</span>
      ))}
    </span>
  );
}

export default function SnakeTranslate({ pairs = PAIRS, speed = 1.6, wave = 0.24 }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const stream = useMemo(() => Array.from({ length: LAPS }, () => pairs).flat(), [pairs]);

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
    const amplitude = reduced ? 0 : fontSize * wave;
    const wavelength = fontSize * 3.6;
    const velocity = reduced ? 0 : fontSize * speed;

    const leftClip = el.querySelector<HTMLElement>(".snake__clip--left")!;
    const rightClip = el.querySelector<HTMLElement>(".snake__clip--right")!;
    const wall = el.querySelector<HTMLElement>(".snake__wall")!;
    leftClip.style.width = `${leftWidth}px`;
    rightClip.style.left = `${rightOrigin}px`;
    rightClip.style.width = `${rightWidth}px`;
    wall.style.left = `${wallX - wallWidth / 2}px`;
    wall.style.width = `${wallWidth}px`;

    const track = (role: "src" | "tgt", index: number): Track => {
      const line = el.querySelector<HTMLElement>(`.snake__line[data-role="${role}"][data-index="${index}"]`)!;
      const chars = Array.from(line.querySelectorAll<HTMLElement>(".snake__char"));
      return { line, chars, centers: chars.map(c => c.offsetLeft + c.offsetWidth / 2), width: line.offsetWidth };
    };

    const minGap = fontSize * 1.4;
    let cursor = 0;
    const items = stream.map((_, i) => {
      const src = track("src", i);
      const tgt = track("tgt", i);
      const start = cursor;
      const gap = Math.max(minGap * 1.4, tgt.width - src.width + minGap);
      cursor += src.width + gap;
      return { src, tgt, start };
    });
    const period = cursor;
    const approach = leftWidth + fontSize;

    const place = (t: Track, x: number, origin: number, visibleWidth: number) => {
      if (x + t.width < -fontSize || x > visibleWidth + fontSize) {
        if (t.line.style.visibility !== "hidden") t.line.style.visibility = "hidden";
        return;
      }
      t.line.style.visibility = "visible";
      t.line.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      t.chars.forEach((c, i) => {
        const phase = ((origin + x + t.centers[i]) / wavelength) * Math.PI * 2;
        const y = amplitude * Math.sin(phase);
        const tilt = Math.atan(amplitude * ((Math.PI * 2) / wavelength) * Math.cos(phase)) * 57.3 * 0.8;
        c.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
      });
    };

    const glow = el.querySelector<HTMLElement>(".snake__glow")!;
    const core = el.querySelector<HTMLElement>(".snake__core")!;
    const flash = (kind: "in" | "out") => {
      const burst = el.querySelector<HTMLElement>(`.snake__flash--${kind}`)!;
      const ring = el.querySelector<HTMLElement>(`.snake__ring--${kind}`)!;
      gsap.killTweensOf([burst, ring]);
      gsap.fromTo(burst, { opacity: 0.95, scale: 0.35 }, { opacity: 0, scale: 1.25, duration: 0.75, ease: "power2.out" });
      gsap.fromTo(ring, { opacity: 0.8, scale: 0.4 }, { opacity: 0, scale: 1.6, duration: 0.9, ease: "power3.out" });
      gsap.fromTo(wall, { scaleX: 1.9, filter: "brightness(1.6)" }, { scaleX: 1, filter: "brightness(1)", duration: 0.6, ease: "elastic.out(1, 0.45)" });
    };

    let travelled = reduced ? items[0].start + Math.max(items[0].src.width, items[0].tgt.width) + fontSize : 0;
    const previous = items.map(() => Number.NaN);
    let energy = 0;
    const render = (animate: boolean) => {
      let active = false;
      items.forEach(({ src, tgt, start }, i) => {
        const d = ((((travelled - start + approach) % period) + period) % period) - approach;
        place(src, leftWidth + d - src.width, 0, leftWidth);
        place(tgt, d - tgt.width, rightOrigin, rightWidth);
        const through = Math.max(src.width, tgt.width);
        if (d > 0 && d < through) active = true;
        const before = previous[i];
        if (animate && !Number.isNaN(before) && before < d) {
          if (before < 0 && d >= 0) flash("in");
          if (before < through && d >= through) flash("out");
        }
        previous[i] = d;
      });
      energy += ((active ? 1 : 0) - energy) * 0.06;
      glow.style.opacity = (0.25 + energy * 0.7).toFixed(3);
      glow.style.transform = `scaleY(${(0.75 + energy * 0.3).toFixed(3)})`;
      core.style.opacity = (energy * 0.9).toFixed(3);
    };
    render(false);

    if (reduced) return;
    const tick = (_time: number, deltaMs: number) => {
      travelled += (velocity * Math.min(deltaMs, 64)) / 1000;
      render(true);
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      gsap.killTweensOf(el.querySelectorAll(".snake__flash, .snake__ring, .snake__wall"));
    };
  }, [layoutVersion, speed, wave, stream]);

  return (
    <figure ref={root} className="snake">
      <figcaption className="visually-hidden">
        {pairs.map(([a, b]) => `${a.name} “${a.text}” becomes ${b.name} “${b.text}”`).join(". ")}
      </figcaption>
      <div className="snake__clip snake__clip--left" aria-hidden="true">
        {stream.map(([a], i) => <Line key={i} phrase={a} index={i} role="src" />)}
      </div>
      <div className="snake__clip snake__clip--right" aria-hidden="true">
        {stream.map(([, b], i) => <Line key={i} phrase={b} index={i} role="tgt" />)}
      </div>
      <span className="snake__wall" aria-hidden="true">
        <span className="snake__glow" />
        <span className="snake__core" />
        <span className="snake__flash snake__flash--in" />
        <span className="snake__flash snake__flash--out" />
        <span className="snake__ring snake__ring--in" />
        <span className="snake__ring snake__ring--out" />
      </span>
    </figure>
  );
}
