import { describe, expect, it } from "vitest";
import { errorMessage } from "./apiError";

describe("errorMessage", () => {
  it("returns the sentence of a 400, 404 or 429 answer", () => {
    expect(errorMessage({ detail: "Use the word “woman” in your sentence." }, 400)).toBe("Use the word “woman” in your sentence.");
  });

  it("turns a 422 list into readable field messages", () => {
    const data = {
      detail: [
        { loc: ["body", "sentence"], msg: "String should have at least 1 character", type: "string_too_short" },
        { loc: ["body", "concept_id"], msg: "Input should be greater than 0", type: "greater_than" },
      ],
    };
    expect(errorMessage(data, 422)).toBe("sentence: String should have at least 1 character; concept_id: Input should be greater than 0");
  });

  it("falls back to the status when the body has no message", () => {
    expect(errorMessage({}, 503)).toBe("Request failed (503)");
    expect(errorMessage(null, 500)).toBe("Request failed (500)");
    expect(errorMessage({ detail: [{ nope: true }] }, 422)).toBe("Request failed (422)");
  });
});
