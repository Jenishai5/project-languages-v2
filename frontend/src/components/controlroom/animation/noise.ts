function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i + seed * 57.31);
  const b = hash(i + 1 + seed * 57.31);
  return (a + (b - a) * u) * 2 - 1;
}

export function random(seed: number, index: number): number {
  return hash(index * 13.7 + seed * 91.1);
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function window01(t: number, start: number, end: number, fade = 0.35): number {
  return smoothstep(start, start + fade, t) * (1 - smoothstep(end - fade, end, t));
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
