import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import ConversationPanel from "./ConversationPanel";

const card = {
  id: 5, concept_id: 1, slug: "doctor", word: "doctor", translation: "el médico", emoji: "🩺",
  sentence: "My doctor reads a red book.", masked_sentence: "My ___ reads a red book.", image_url: null, created_at: "",
};

class FakeUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  text: string;
  constructor(text: string) {
    this.text = text;
  }
}

const answers: Record<string, unknown> = {
  "/api/agents/conversation/start": {
    available: true, reply: "Hi! What does your doctor read?", correction: null, message: null, remaining_today: 9,
    word: "doctor", sentence: card.sentence, lesson_words: ["doctor"],
  },
  "/api/agents/conversation/turn": {
    available: true, reply: "Is it a big book?", message: null, remaining_today: 8,
    correction: { wrong: "He read book", right: "He reads a book", why: "falta la -s" },
  },
  "/api/agents/conversation/finish": { words_used: ["doctor"], mistakes_saved: 1 },
};

test("a conversation runs in memory and only the results are sent at the end", async () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(
    async url => ({ ok: true, json: async () => answers[url] }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const spoken: string[] = [];
  vi.stubGlobal("speechSynthesis", { cancel: vi.fn(), speak: (u: { text: string }) => spoken.push(u.text), getVoices: () => [], speaking: false, pending: false });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  const onClose = vi.fn();
  render(<ConversationPanel card={card} learning="eng" native="spa" onClose={onClose} />);

  expect(await screen.findByText("Hi! What does your doctor read?")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "He read book" } });
  fireEvent.click(screen.getByText("Send"));

  expect(await screen.findByText("Is it a big book?")).toBeInTheDocument();
  expect(screen.getByText("He reads a book")).toBeInTheDocument();
  expect(spoken).toEqual(["Hi! What does your doctor read?", "Is it a big book?"]);

  fireEvent.click(screen.getByText("End conversation"));
  expect(await screen.findByText("Nice talk!")).toBeInTheDocument();
  expect(screen.getByText(/1 correction saved/)).toBeInTheDocument();

  const sent = (url: string) => JSON.parse(String(fetchMock.mock.calls.find(([u]) => u === url)?.[1]?.body));
  expect(sent("/api/agents/conversation/turn").history).toEqual([{ role: "assistant", text: "Hi! What does your doctor read?" }]);
  expect(sent("/api/agents/conversation/finish")).toEqual({
    mnemonic_id: 5, learning: "eng", native: "spa",
    messages: ["He read book"],
    corrections: [{ wrong: "He read book", right: "He reads a book", why: "falta la -s" }],
  });
  vi.unstubAllGlobals();
});

test("the voice can be switched off", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => answers[url] })));
  const cancelSpeech = vi.fn();
  vi.stubGlobal("speechSynthesis", { cancel: cancelSpeech, speak: vi.fn(), getVoices: () => [], speaking: false, pending: false });
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  render(<ConversationPanel card={card} learning="eng" native="spa" onClose={vi.fn()} />);

  await screen.findByText("Hi! What does your doctor read?");
  fireEvent.click(screen.getByText("🔊 Voice on"));

  expect(screen.getByText("🔇 Voice off")).toBeInTheDocument();
  expect(cancelSpeech).toHaveBeenCalled();
  expect(localStorage.getItem("turtletalk.chat-voice")).toBe("off");
  localStorage.clear();
  vi.unstubAllGlobals();
});
