import { fireEvent, render, screen } from "@testing-library/react";
import { typedAnswerMatches } from "../../lib/speech";
import type { Mnemonic } from "../../lib/mnemonicsApi";
import Flashcards from "./Flashcards";
import MnemonicCard from "./MnemonicCard";

const card: Mnemonic = {
  id: 1,
  concept_id: 2,
  slug: "woman",
  word: "woman",
  translation: "la mujer",
  emoji: "👩",
  sentence: "The woman reads a book.",
  masked_sentence: "The ___ reads a book.",
  image_url: "https://signed.test/w.png",
  created_at: "2026-11-25T13:00:00Z",
};

test("picture card shows the picture and the learner's sentence", () => {
  render(<MnemonicCard word="woman" translation="la mujer" emoji="👩" imageUrl={card.image_url} sentence={card.sentence} />);

  expect(screen.getByRole("img", { name: "Picture of: The woman reads a book." })).toHaveAttribute("src", card.image_url);
  expect(screen.getByText("“The woman reads a book.”")).toBeInTheDocument();
});

test("picture card falls back to the emoji", () => {
  render(<MnemonicCard word="cat" translation="el gato" emoji="🐱" />);

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("🐱")).toBeInTheDocument();
});

test("typed answers ignore case, accents and articles", () => {
  expect(typedAnswerMatches("Woman", "woman", "eng")).toBe(true);
  expect(typedAnswerMatches("the woman", "woman", "eng")).toBe(true);
  expect(typedAnswerMatches("medica", "el médico / la médica", "spa")).toBe(true);
  expect(typedAnswerMatches("man", "woman", "eng")).toBe(false);
});

test("flashcard hides the word, checks a typed answer and flips", () => {
  render(<Flashcards cards={[card]} learning="eng" onExit={() => {}} />);

  expect(screen.getByText("The ___ reads a book.")).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Type the missing word"), { target: { value: "woman" } });
  fireEvent.click(screen.getByText("Check"));

  expect(screen.getByText("Well done!")).toBeInTheDocument();
  expect(screen.getByText("Correct!")).toBeInTheDocument();
  fireEvent.click(screen.getByText("See results"));
  expect(screen.getByText("1 of 1")).toBeInTheDocument();
});
