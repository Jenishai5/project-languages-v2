import { scrambleFrame } from "./scramble";

test("scramble starts noisy, keeps spaces and punctuation, and ends on the target", () => {
  const first = scrambleFrame("Hello, how are you?", "Hola, ¿cómo estás?", 0, () => 0);

  expect(first[4]).toBe(",");
  expect(first[5]).toBe(" ");
  expect(scrambleFrame("Hello, how are you?", "Hola, ¿cómo estás?", 1)).toBe("Hola, ¿cómo estás?");
  expect(scrambleFrame("Hello", "Hola, ¿cómo estás?", 0.5, () => 0).startsWith("Hola, ¿c")).toBe(true);
});
