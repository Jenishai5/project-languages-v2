import { planMorph, splitWords } from "./morphPlan";

test("shared letters are kept and accented letters morph in place", () => {
  const steps = planMorph("Hola, ¿cómo estás?", "Hola, com estàs?");
  const kept = steps.filter(s => s.kind === "keep").map(s => s.char).join("");

  expect(kept.startsWith("Hola,c")).toBe(true);
  expect(steps).toContainEqual({ kind: "morph", from: 15, to: 13, oldChar: "á", newChar: "à" });
  expect(steps).toContainEqual({ kind: "remove", from: 6, char: "¿" });
});

test("every visible character is used exactly once on each side", () => {
  const source = "Привет, как дела?";
  const target = "Hello, how are you?";
  const steps = planMorph(source, target);
  const from = steps.flatMap(s => ("from" in s ? [s.from] : [])).sort((x, y) => x - y);
  const to = steps.flatMap(s => ("to" in s ? [s.to] : [])).sort((x, y) => x - y);

  expect(from).toEqual([...source].flatMap((c, i) => (c === " " ? [] : [i])));
  expect(to).toEqual([...target].flatMap((c, i) => (c === " " ? [] : [i])));
  expect(steps.some(s => s.kind === "morph")).toBe(true);
});

test("identical texts keep every letter", () => {
  expect(planMorph("hola", "hola").every(s => s.kind === "keep")).toBe(true);
});

test("words keep their original character indexes", () => {
  expect(splitWords("Hi you").map(w => w.chars.map(c => c.index))).toEqual([[0, 1], [3, 4, 5]]);
});
