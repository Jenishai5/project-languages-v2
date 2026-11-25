import { useEffect, useRef } from "react";
import gsap from "gsap";

type Props = { colors: string[]; duration?: number };

const SHAPES = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "63% 37% 41% 59% / 55% 62% 38% 45%",
  "38% 62% 52% 48% / 62% 38% 62% 38%",
  "55% 45% 35% 65% / 40% 58% 42% 60%",
];

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export default function FluidBackdrop({ colors, duration = 2.6 }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const first = useRef(colors);

  useEffect(() => {
    const el = root.current;
    if (!el || reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".fluid__blob", el).forEach((blob, i) => {
        gsap.to(blob, {
          xPercent: gsap.utils.random(-28, 28),
          yPercent: gsap.utils.random(-22, 22),
          scale: gsap.utils.random(0.85, 1.2),
          rotation: gsap.utils.random(-40, 40),
          duration: gsap.utils.random(6, 9),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          delay: i * 0.6,
        });
        gsap.to(blob, {
          borderRadius: SHAPES[(i + 1) % SHAPES.length],
          duration: gsap.utils.random(4, 6),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        });
      });
    }, el);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const blobs = gsap.utils.toArray<HTMLElement>(".fluid__blob", el);
    const tweens = blobs.map((blob, i) =>
      gsap.to(blob, {
        backgroundColor: colors[i % colors.length],
        duration: reducedMotion() ? 0.3 : duration,
        delay: i * duration * 0.08,
        ease: "sine.inOut",
        overwrite: "auto",
      }),
    );
    const swell = reducedMotion()
      ? null
      : gsap.fromTo(blobs, { "--swell": 1 }, { "--swell": 1.25, duration: duration / 2, ease: "sine.inOut", yoyo: true, repeat: 1, stagger: 0.12 });
    return () => {
      tweens.forEach(t => t.kill());
      swell?.kill();
    };
  }, [colors, duration]);

  return (
    <div ref={root} className="fluid" aria-hidden="true">
      {first.current.map((color, i) => (
        <span key={i} className={`fluid__blob fluid__blob--${i + 1}`} style={{ backgroundColor: color, borderRadius: SHAPES[i % SHAPES.length] }} />
      ))}
    </div>
  );
}
