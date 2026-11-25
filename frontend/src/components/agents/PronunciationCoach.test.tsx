import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import PronunciationCoach from "./PronunciationCoach";

vi.mock("../../lib/recordWav", () => ({
  recordWav: vi.fn(async () => new Blob(["RIFF"], { type: "audio/wav" })),
}));

test("the coach records, sends the WAV and shows the score with weak sounds", async () => {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({
    ok:   true,
    json: async () => ({
      available: true, heard: true, text: "doctor", recognized: "Doctor.", pronunciation: 80.4, accuracy: 72, fluency: 90,
      completeness: 100, words: [{ word: "doctor", accuracy: 72, error: "None" }], weak_sounds: ["ɒ"],
      verdict: "Good! Listen again and copy the sounds marked in pink.", message: null, remaining_today: 12,
    }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<PronunciationCoach word="doctor" learning="eng" />);

  fireEvent.click(screen.getByText("🎯 Score my pronunciation"));

  expect(await screen.findByText("80")).toBeInTheDocument();
  expect(screen.getByText("Practise the sound /ɒ/.")).toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/agents/pronunciation/assess?learning=eng&text=doctor");
  expect(new Headers(init?.headers).get("Content-Type")).toBe("audio/wav");
  vi.unstubAllGlobals();
});
