import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import WordList from "../lesson/WordList";

test("the word list opens a culture note for one word", async () => {
  const fetchMock = vi.fn(async () => ({
    ok:   true,
    json: async () => ({
      concept_id: 1, word: "doctor", translation: "el médico", available: true, cached: false, message: null, remaining_today: 7,
      note: "Se usa también como título.", expressions: [{ phrase: "An apple a day keeps the doctor away", meaning: "Comer sano" }],
      fun_fact: null,
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<WordList words={[{ concept_id: 1, slug: "doctor", word: "doctor", translation: "el médico", emoji: null, image_url: null }]} learning="eng" native="spa" />);

  fireEvent.click(screen.getByText("🌍 Culture"));

  expect(await screen.findByText("Se usa también como título.")).toBeInTheDocument();
  expect(screen.getByText("“An apple a day keeps the doctor away”")).toBeInTheDocument();
  vi.unstubAllGlobals();
});
