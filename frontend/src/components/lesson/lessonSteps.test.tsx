import { act, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import BuildStep from "./BuildStep";
import MatchStep from "./MatchStep";
import PictureStep from "./PictureStep";
import PronounceStep from "./PronounceStep";
import TrainingMenu from "./TrainingMenu";
import { heardWord, targetsFor } from "../../lib/speech";
import type { LessonSentence, LessonWord, PictureRound } from "../../lib/lessonsApi";

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

test("picture step shows the emoji and checks the chosen word", () => {
  const onDone = vi.fn();
  const rounds: PictureRound[] = [
    { slug: "paper", emoji: "📄", image_url: null, options: ["doctor", "paper", "car", "dog"], answer: "paper" },
  ];
  render(<PictureStep rounds={rounds} onDone={onDone} />);

  expect(screen.getByRole("img", { name: "Guess the word" })).toHaveTextContent("📄");
  fireEvent.click(screen.getByText("car"));

  expect(screen.getByText("❌ It's “paper”")).toBeInTheDocument();
  fireEvent.click(screen.getByText("See results →"));
  expect(onDone).toHaveBeenCalledWith(0, 1);
});

test("speech matching ignores case, accents, punctuation and articles", () => {
  expect(targetsFor("el médico / la médica", "spa")).toEqual(["medico", "medica"]);
  expect(heardWord(["The doctor."], "doctor", "eng")).toBe(true);
  expect(heardWord(["Médica"], "el médico / la médica", "spa")).toBe(true);
  expect(heardWord(["ice cream please"], "ice cream", "eng")).toBe(true);
  expect(heardWord(["Ёлка"], "елка", "rus")).toBe(true);
  expect(heardWord(["doctors"], "doctor", "eng")).toBe(false);
  expect(heardWord(["dog", "doctor"], "doctor", "eng")).toBe(true);
});

class FakeRecognition {
  static last: FakeRecognition;
  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  abort() {}
  say(...transcripts: string[]) {
    act(() => this.onresult?.({ results: [transcripts.map(transcript => ({ transcript }))] }));
  }
}

test("pronounce step accepts the spoken word and counts it once", () => {
  Object.assign(window, { webkitSpeechRecognition: FakeRecognition });
  const onDone = vi.fn();
  render(<PronounceStep words={words.slice(0, 1)} learning="eng" onDone={onDone} />);

  fireEvent.click(screen.getByText("Say it"));
  expect(FakeRecognition.last.lang).toBe("en-US");
  FakeRecognition.last.say("the doctor");
  expect(screen.getByText("✅ Great! I heard “the doctor”.")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Try again"));
  FakeRecognition.last.say("doctor");
  fireEvent.click(screen.getByText("Finish →"));

  expect(onDone).toHaveBeenCalledWith(1, 1);
  delete (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

test("pronounce step lets the user skip when the browser cannot listen", () => {
  const onDone = vi.fn();
  render(<PronounceStep words={words} learning="eng" onDone={onDone} />);

  expect(screen.getByText(/Open the app in Chrome or Safari/)).toBeInTheDocument();
  fireEvent.click(screen.getByText("Skip this step →"));
  expect(onDone).toHaveBeenCalledWith(0, 0);
});

test("training menu shows four trainings with their results", () => {
  const onOpen = vi.fn();
  render(
    <TrainingMenu
      available={{ match: true, shuffle: false, pronounce: true, picture: true }}
      results={{ match: { correct: 8, total: 10 }, pronounce: { correct: 0, total: 0 } }}
      onOpen={onOpen}
    />,
  );

  expect(screen.getAllByRole("button")).toHaveLength(4);
  expect(screen.getByRole("button", { name: "Match" })).toHaveTextContent("✓ 8 of 10");
  expect(screen.getByRole("button", { name: "Shuffle" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Pronounce" })).toHaveTextContent("✓ Skipped");
  fireEvent.click(screen.getByRole("button", { name: "Picture" }));
  expect(onOpen).toHaveBeenCalledWith("picture");
});

test("build step offers an AI explanation for a wrong order", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok:   true,
    json: async () => ({
      correct: false, available: true, cached: false, message: null, remaining_today: 29,
      explanation: "El verbo va después del sujeto.",
      mistakes: [{ wrong: "doctor the Call", right: "Call the doctor", why: "imperativo primero" }],
      tip: "Empieza por el verbo.",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<BuildStep sentences={[sentence(4, "Call the doctor.", "Llama al médico.")]} learning="eng" native="spa" onDone={vi.fn()} />);

  clickWords(["doctor", "the", "Call"]);
  fireEvent.click(screen.getByText("Check"));
  fireEvent.click(screen.getByText("Why is this wrong?"));

  expect(await screen.findByText("El verbo va después del sujeto.")).toBeInTheDocument();
  expect(screen.getByText("29 explanations left today")).toBeInTheDocument();
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body).toEqual({ sentence_id: 4, answer: ["doctor", "the", "Call"], learning: "eng", native: "spa" });
  vi.unstubAllGlobals();
});

test("match step saves word results and shows the hardest words with help", async () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async url => ({
    ok:   true,
    json: async () => url.includes("/vocabulary/weak")
      ? { words: [{ concept_id: 1, slug: "doctor", word: "doctor", translation: "el médico", emoji: null, attempts: 2, correct: 1 }] }
      : url.includes("/vocabulary/help")
        ? { concept_id: 1, word: "doctor", translation: "el médico", available: true, cached: false, message: null, remaining_today: 20,
            examples: [{ sentence: "The doctor is kind.", translation: "El médico es amable." }], synonyms: ["physician"], antonyms: [], tip: "Piensa en la bata blanca." }
        : {},
  }));
  vi.stubGlobal("fetch", fetchMock);
  const words = [
    { concept_id: 1, slug: "doctor", word: "doctor", translation: "el médico", emoji: null, image_url: null },
    { concept_id: 2, slug: "paper", word: "paper", translation: "el papel", emoji: null, image_url: null },
  ];
  render(<MatchStep words={words} learning="eng" native="spa" lessonId={7} onDone={vi.fn()} />);

  fireEvent.click(screen.getByText("doctor"));
  fireEvent.click(screen.getByText("el papel"));
  fireEvent.click(screen.getByText("doctor"));
  fireEvent.click(screen.getByText("el médico"));
  fireEvent.click(screen.getByText("paper"));
  fireEvent.click(screen.getByText("el papel"));

  expect(await screen.findByText("Your hardest words")).toBeInTheDocument();
  const saved = fetchMock.mock.calls.filter(([url]) => url === "/api/progress/lesson-word").map(([, init]) => JSON.parse(String(init?.body)));
  expect(saved).toEqual([
    { concept_id: 1, learning: "eng", correct: false },
    { concept_id: 1, learning: "eng", correct: true },
    { concept_id: 2, learning: "eng", correct: true },
  ]);
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("lesson_id=7"))).toBe(true);

  fireEvent.click(screen.getByText("Help me remember"));
  expect(await screen.findByText("The doctor is kind.")).toBeInTheDocument();
  expect(screen.getByText("physician")).toBeInTheDocument();
  vi.unstubAllGlobals();
});
