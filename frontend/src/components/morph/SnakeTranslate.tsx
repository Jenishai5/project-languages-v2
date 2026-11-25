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
    const wallWidth = Math.max(5, fontSize * 0.12);
    const wallX = width / 2;
    const leftWidth = wallX - wallWidth / 2;
    const rightOrigin = wallX + wallWidth / 2;
    const rightWidth = width - rightOrigin;
    const amplitude = reduced ? 0 : fontSize * wave;
    const wavelength = fontSize * 11;
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

    const zone = fontSize * 2.6;
    const squeeze = 0.15;
    const squeezed = (r: number) => {
      if (r >= zone) return { r, scale: 1 };
      const u = Math.max(0, r) / zone;
      const curve = squeeze * u + (2 - 2 * squeeze) * u * u + (squeeze - 1) * u * u * u;
      const slope = squeeze + 2 * (2 - 2 * squeeze) * u + 3 * (squeeze - 1) * u * u;
      return { r: curve * zone, scale: Math.max(0.05, slope) };
    };

    const place = (t: Track, x: number, side: "left" | "right", visibleWidth: number) => {
      if (x + t.width < -fontSize || x > visibleWidth + fontSize) {
        if (t.line.style.visibility !== "hidden") t.line.style.visibility = "hidden";
        return;
      }
      const origin = side === "left" ? 0 : rightOrigin;
      t.line.style.visibility = "visible";
      t.line.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
      t.chars.forEach((c, i) => {
        const local = x + t.centers[i];
        const distance = side === "left" ? leftWidth - local : local;
        const { r, scale } = squeezed(distance);
        const shift = side === "left" ? distance - r : r - distance;
        const phase = ((origin + local) / wavelength) * Math.PI * 2;
        const y = amplitude * Math.sin(phase);
        const tilt = Math.atan(amplitude * ((Math.PI * 2) / wavelength) * Math.cos(phase)) * 57.3 * 0.8;
        const scaleY = 0.7 + 0.3 * Math.min(1, scale);
        c.style.transform = `translate3d(${shift.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)}, ${scaleY.toFixed(3)})`;
      });
    };

    let travelled = reduced ? items[0].start + Math.max(items[0].src.width, items[0].tgt.width) + fontSize : 0;
    const render = () => {
      items.forEach(({ src, tgt, start }) => {
        const d = ((((travelled - start + approach) % period) + period) % period) - approach;
        place(src, leftWidth + d - src.width, "left", leftWidth);
        place(tgt, d - tgt.width, "right", rightWidth);
      });
    };
    render();

    if (reduced) return;
    const tick = (_time: number, deltaMs: number) => {
      travelled += (velocity * Math.min(deltaMs, 64)) / 1000;
      render();
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
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
      <span className="snake__wall" aria-hidden="true" />
    </figure>
  );
}
