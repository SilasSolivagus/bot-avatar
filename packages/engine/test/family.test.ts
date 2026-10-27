import { describe, expect, it } from "vitest";
import { avatarAssignableLooks, avatarFamily, avatarLook } from "../src/family.js";
import type { ShapeFamily } from "../src/spec.js";

const ten = Array.from({ length: 10 }, (_, index) => ({
  outline: [[0, 0]],
  ...(index === 6 ? { reserved: true } : {}),
  ...(index === 8 ? { look: 2 } : {}),
})) satisfies ShapeFamily[];

describe("avatarFamily", () => {
  it("stays inside the pack's shape count", () => {
    for (let seed = 0; seed < 500; seed++) {
      const family = avatarFamily(seed, ten);
      expect(family).toBeGreaterThanOrEqual(0);
      expect(family).toBeLessThan(ten.length);
    }
  });

  it("lets the hash land on the reserved family", () => {
    // Upstream does not exclusion-filter the hash; only assignment skips
    // reserved families. The fixture parity test records upstream examples.
    expect(avatarFamily(6, ten)).toBe(6);
  });
});

describe("avatarLook", () => {
  it("maps a declared look and falls back to the family index", () => {
    expect(avatarLook(8, ten)).toBe(2);
    expect(avatarLook(7, ten)).toBe(7);
  });

  it("tolerates a family outside the pack", () => {
    expect(avatarLook(99, ten)).toBe(99);
  });
});

describe("avatarAssignableLooks", () => {
  it("drops the reserved family and merges duplicates", () => {
    expect(avatarAssignableLooks(ten)).toEqual([0, 1, 2, 3, 4, 5, 7, 9]);
  });
});
