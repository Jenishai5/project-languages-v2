export type MorphStep =
  | { kind: "keep"; from: number; to: number; char: string }
  | { kind: "morph"; from: number; to: number; oldChar: string; newChar: string }
  | { kind: "remove"; from: number; char: string }
  | { kind: "add"; to: number; char: string };

export type Word = { chars: { char: string; index: number }[] };

const EXACT = 3;
const SIMILAR = 2;

export function baseLetter(char: string): string {
  return char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function visibleIndexes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) out.push(i);
  return out;
}

function score(a: string, b: string): number {
  if (a === b) return EXACT;
  if (baseLetter(a) === baseLetter(b)) return SIMILAR;
  return 0;
}

export function splitWords(text: string): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) {
      current = null;
      continue;
    }
    if (!current) {
      current = { chars: [] };
      words.push(current);
    }
    current.chars.push({ char: text[i], index: i });
  }
  return words;
}

export function planMorph(source: string, target: string): MorphStep[] {
  const a = visibleIndexes(source);
  const b = visibleIndexes(target);
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const s = score(source[a[i]], target[b[j]]);
      table[i][j] = Math.max(table[i + 1][j], table[i][j + 1], s ? s + table[i + 1][j + 1] : 0);
    }
  }

  const steps: MorphStep[] = [];
  let removed: number[] = [];
  let added: number[] = [];

  const flushGap = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      steps.push({ kind: "morph", from: removed[k], to: added[k], oldChar: source[removed[k]], newChar: target[added[k]] });
    }
    for (const from of removed.slice(pairs)) steps.push({ kind: "remove", from, char: source[from] });
    for (const to of added.slice(pairs)) steps.push({ kind: "add", to, char: target[to] });
    removed = [];
    added = [];
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = score(source[a[i]], target[b[j]]);
    if (s && table[i][j] === s + table[i + 1][j + 1]) {
      flushGap();
      if (s === EXACT) steps.push({ kind: "keep", from: a[i], to: b[j], char: source[a[i]] });
      else steps.push({ kind: "morph", from: a[i], to: b[j], oldChar: source[a[i]], newChar: target[b[j]] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      removed.push(a[i++]);
    } else {
      added.push(b[j++]);
    }
  }
  while (i < n) removed.push(a[i++]);
  while (j < m) added.push(b[j++]);
  flushGap();
  return steps;
}
