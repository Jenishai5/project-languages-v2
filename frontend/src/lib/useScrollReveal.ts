import { useLayoutEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function useScrollReveal(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof window.matchMedia !== "function" || prefersReducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const reveal = (targets: Element | Element[], trigger: Element, stagger = 0) =>
        gsap.from(targets, {
          y: 36,
          autoAlpha: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger,
          clearProps: "opacity,visibility,transform",
          scrollTrigger: { trigger, start: "top 88%", once: true },
        });

      gsap.utils.toArray<HTMLElement>("[data-reveal]", el).forEach(node => reveal(node, node));
      gsap.utils.toArray<HTMLElement>("[data-reveal-group]", el).forEach(group =>
        reveal(Array.from(group.children), group, 0.12),
      );
    }, el);

    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    return () => ctx.revert();
  }, [root]);
}
