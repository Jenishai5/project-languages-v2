const NOISE = "abcdefghijklmnopqrstuvwxyzáéíóúàèòçñабвгдежзиклмнопрстуфхцчшэюя";

export function scrambleFrame(from: string, to: string, progress: number, random: () => number = Math.random): string {
  const length = Math.max(from.length, to.length);
  const settled = Math.floor(progress * length);
  let out = "";
  for (let i = 0; i < length; i++) {
    const target = to[i] ?? "";
    if (i < settled) {
      out += target;
    } else if (target === " " || target === "" || /[,.?¿!¡]/.test(target)) {
      out += target || (from[i] && progress < 0.5 ? from[i] : "");
    } else {
      out += NOISE[Math.floor(random() * NOISE.length)];
    }
  }
  return progress >= 1 ? to : out;
}
