import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { avatarSampleIdentity, pickLeastUsed } from "../src/assignment.js";
import { avatarAssignableLooks, avatarFamily } from "../src/family.js";
import { avatarSeed } from "../src/seed.js";

/** A deterministic pseudo-random source for tests; library code never needs one. */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

describe("pickLeastUsed", () => {
  it("prefers the least used option", () => {
    expect(pickLeastUsed([1, 2, 3], [1, 1, 2], () => 0)).toBe(3);
  });

  it("breaks ties randomly among the least used", () => {
    expect(pickLeastUsed([1, 2, 3], [], () => 0)).toBe(1);
    expect(pickLeastUsed([1, 2, 3], [], () => 0.99)).toBe(3);
  });

  it("falls back to the least-used options when every option is avoided", () => {
    expect(pickLeastUsed([1, 2], [1, 1], () => 0, [2])).toBe(2);
    expect(pickLeastUsed([1, 2], [1, 1], () => 0, [1, 2])).toBe(2);
  });

  it("never leaves the options", () => {
    const random = sequence([0, 0.3, 0.7, 0.999]);
    for (let index = 0; index < 50; index++) {
      expect([1, 2, 3]).toContain(pickLeastUsed([1, 2, 3], [2, 3], random));
    }
  });

  it("balances repeated assignment until every look is used equally", () => {
    const looks = avatarAssignableLooks(organicBlob.shapes);
    const used: number[] = [];
    const random = sequence([0.11, 0.37, 0.59, 0.83]);
    for (let index = 0; index < 40; index++) used.push(pickLeastUsed(looks, used, random));

    const counts = looks.map((look) => used.filter((value) => value === look).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});

describe("avatarSampleIdentity", () => {
  it("takes a family index and returns a stable identity for it", () => {
    const identity = avatarSampleIdentity(organicBlob, 3);
    expect(identity).toMatch(/^look-3-\d+$/);
    expect(avatarFamily(avatarSeed(identity), organicBlob.shapes)).toBe(3);
    expect(avatarSampleIdentity(organicBlob, 3)).toBe(identity);
  });

  it("lands on the requested family for every family", () => {
    for (let family = 0; family < organicBlob.shapes.length; family++) {
      const identity = avatarSampleIdentity(organicBlob, family);
      expect(avatarFamily(avatarSeed(identity), organicBlob.shapes)).toBe(family);
      expect(identity).toBe(avatarSampleIdentity(organicBlob, family));
    }
  });

  it("returns one distinct identity per family", () => {
    const identities = organicBlob.shapes.map((_, family) =>
      avatarSampleIdentity(organicBlob, family),
    );
    expect(new Set(identities).size).toBe(identities.length);
  });

  it("throws instead of searching forever for a family outside the pack", () => {
    expect(() => avatarSampleIdentity(organicBlob, organicBlob.shapes.length)).toThrow(RangeError);
    expect(() => avatarSampleIdentity(organicBlob, organicBlob.shapes.length)).toThrow(
      `family must be an integer in [0, ${organicBlob.shapes.length}); received ${organicBlob.shapes.length}`,
    );
    expect(() => avatarSampleIdentity(organicBlob, -1)).toThrow(RangeError);
    expect(() => avatarSampleIdentity(organicBlob, -1)).toThrow(/received -1/);
    expect(() => avatarSampleIdentity(organicBlob, 1.5)).toThrow(RangeError);
    expect(() => avatarSampleIdentity(organicBlob, Number.NaN)).toThrow(RangeError);
  });
});
