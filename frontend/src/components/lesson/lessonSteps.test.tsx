import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import BuildStep from "./BuildStep";
import ListenStep from "./ListenStep";
import MatchStep from "./MatchStep";
import type { LessonSentence, LessonWord, ListeningItem } from "../../lib/lessonsApi";

const words: LessonWord[] = [
  { concept_id: 1, slug: "doctor", word: "doctor", translation: "el médico", emoji: null, image_url: null },
  { concept_id: 2, slug: "paper", word: "paper", translation: "el papel", emoji: "📄", image_url: null },
];

function sentence(id: number, text: string, prompt: string): LessonSentence {
  return {
    id,
    concept_slug: "doctor",
    full_text: text,
    prompt,
    words: text.replace(/[.!?]$/, "").split(" ").map((form, position) => ({ form, position, word_type: "" })),
    level: "A1",
    audio: null,
  };
}

function clickWords(forms: string[]) {
  for (const form of forms) {
    fireEvent.click(screen.getAllByText(form).at(-1)!);
  }
}

test("match step finishes after every pair is matched and counts mistakes", () => {
  const onDone = vi.fn();
  render(<MatchStep words={words} onDone={onDone} />);

  fireEvent.click(screen.getByText("doctor"));
  fireEvent.click(screen.getByText("el papel"));
  fireEvent.click(screen.getByText("doctor"));
  fireEvent.click(screen.getByText("el médico"));
  fireEvent.click(screen.getByText("paper"));
  fireEvent.click(screen.getByText("el papel"));
  fireEvent.click(screen.getByText(/Done with 1 mistake/));

  expect(onDone).toHaveBeenCalledWith(2, 3);
});

test("build step accepts the right order and reports the score", () => {
  const onDone = vi.fn();
  render(<BuildStep sentences={[sentence(1, "Call the doctor.", "Llama al médico.")]} learning="eng" onDone={onDone} />);

  expect(screen.getByText("Llama al médico.")).toBeInTheDocument();
  clickWords(["Call", "the", "doctor"]);
  fireEvent.click(screen.getByText("Check"));

  expect(screen.getByText("✅ Correct!")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Finish building →"));
  expect(onDone).toHaveBeenCalledWith(1, 1);
});

test("build step accepts swapping identical words", () => {
  const onDone = vi.fn();
  render(<BuildStep sentences={[sentence(2, "The doctor read the paper.", "El médico leyó el papel.")]} learning="eng" onDone={onDone} />);

  clickWords(["The", "doctor", "read", "the", "paper"]);
  fireEvent.click(screen.getByText("Check"));

  expect(screen.getByText("✅ Correct!")).toBeInTheDocument();
});

test("build step shows the answer when the order is wrong", () => {
  render(<BuildStep sentences={[sentence(3, "Call the doctor.", "Llama al médico.")]} learning="eng" onDone={vi.fn()} />);

  clickWords(["doctor", "the", "Call"]);
  fireEvent.click(screen.getByText("Check"));

  expect(screen.getByText("❌ The answer is: Call the doctor.")).toBeInTheDocument();
});

test("listen step marks the chosen option and moves on", () => {
  const onDone = vi.fn();
  const items: ListeningItem[] = [
    {
      sentence_id: 1,
      audio: { url: "https://example.org/a.mp3", author: "CK", license: "CC BY 4.0", attribution_url: null },
      options: ["Get a doctor.", "I need paper.", "Call the doctor."],
      answer: "Call the doctor.",
    },
  ];
  render(<ListenStep items={items} onDone={onDone} />);

  fireEvent.click(screen.getByText("Call the doctor."));

  expect(screen.getByText("✅ Correct!")).toBeInTheDocument();
  expect(screen.getByText(/Recording by/)).toHaveTextContent("CK · CC BY 4.0 · from Tatoeba");
  fireEvent.click(screen.getByText("See results →"));
  expect(onDone).toHaveBeenCalledWith(1, 1);
});
