import { describe, expect, it } from "vitest";
import { avatarSeed } from "../src/seed.js";
import { fixtureRows } from "./helpers.js";

describe("avatarSeed", () => {
  it("matches the recorded seeds for every fixture identity", () => {
    for (const row of fixtureRows) {
      expect(avatarSeed(row.identity)).toBe(row.seed);
    }
  });

  it("is deterministic and ignores call order", () => {
    const first = avatarSeed("research");
    avatarSeed("health");
    expect(avatarSeed("research")).toBe(first);
  });

  it("never returns a negative number", () => {
    for (const identity of ["", "a", "bot_123", "ü", "x".repeat(200)]) {
      expect(avatarSeed(identity)).toBeGreaterThanOrEqual(0);
    }
  });
});
