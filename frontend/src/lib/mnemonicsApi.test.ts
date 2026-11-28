import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./progressService", () => ({
  authHeaders: async () => ({ "Content-Type": "application/json", Authorization: "Bearer token" }),
}));

import { saveMnemonic } from "./mnemonicsApi";

function answer(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
}

afterEach(() => vi.unstubAllGlobals());

describe("saveMnemonic", () => {
  it("sends the Idempotency-Key header and reads whether the answer was replayed", async () => {
    const fetchMock = answer(200, { id: 7 }, { "Idempotent-Replayed": "true" });
    vi.stubGlobal("fetch", fetchMock);

    const saved = await saveMnemonic(3, "eng", "spa", "The cat sleeps.", "key-123456");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("key-123456");
    expect(saved).toEqual({ card: { id: 7 }, replayed: true });
  });

  it("shows the server's message when the key was used for another sentence", async () => {
    vi.stubGlobal("fetch", answer(409, { detail: "This Idempotency-Key was already used for a different request. Use a new key." }));

    await expect(saveMnemonic(3, "eng", "spa", "Other.", "key-123456")).rejects.toThrow("already used");
  });
});
