import { describe, expect, it } from "vitest";
import { avatarAssignableLooks, avatarFamily, avatarLook } from "../src/family.js";
import type { ShapeFamily } from "../src/spec.js";
import { fixtureRows } from "./helpers.js";

const ten = Array.from({ length: 10 }, (_, index) => ({
  outline: [[0, 0]],
  ...(index === 6 ? { reserved: true } : {}),
  ...(index === 8 ? { look: 2 } : {}),
})) satisfies ShapeFamily[];

describe("avatarFamily", () => {
  it("matches the recorded family for every fixture identity", () => {
    for (const row of fixtureRows) {
      expect(avatarFamily(row.seed, ten)).toBe(row.family);
    }
  });

  it("stays inside the pack's shape count", () => {
    for (let seed = 0; seed < 500; seed++) {
      const family = avatarFamily(seed, ten);
      expect(family).toBeGreaterThanOrEqual(0);
      expect(family).toBeLessThan(ten.length);
    }
  });

  it("uses the hash, not an exclusion list", () => {
    // Upstream lets identity hashes land on the reserved family; it only
    // keeps reserved families out of assignment.
    expect([...fixtureRows].some((row) => row.family === 6)).toBe(true);
  });
});

describe("avatarLook", () => {
  it("matches the recorded look for every fixture identity", () => {
    for (const row of fixtureRows) {
      expect(avatarLook(row.family, ten)).toBe(row.look);
    }
  });

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
