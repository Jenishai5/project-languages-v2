import { describe, expect, it } from "vitest";
import { attemptFor } from "./idempotency";

describe("attemptFor", () => {
  it("makes a new key for a first save", () => {
    expect(attemptFor(undefined, "The cat sleeps.", () => "key-1")).toEqual({ sentence: "The cat sleeps.", key: "key-1" });
  });

  it("reuses the key when the same sentence is sent again", () => {
    const first = attemptFor(undefined, "The cat sleeps.", () => "key-1");
    expect(attemptFor(first, "The cat sleeps.", () => "key-2").key).toBe("key-1");
  });

  it("makes a new key when the sentence changed", () => {
    const first = attemptFor(undefined, "The cat sleeps.", () => "key-1");
    expect(attemptFor(first, "The cat eats.", () => "key-2").key).toBe("key-2");
  });

  it("makes UUID keys the server accepts", () => {
    expect(attemptFor(undefined, "x").key).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
  });
});
