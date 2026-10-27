import { describe, expect, it } from "vitest";
import {
  avatarFamily,
  avatarLook,
  avatarSeed,
  buildAvatarSpec,
  colorIndex,
  outlinePath,
  phaseForSeed,
} from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { fixtureRows } from "../packages/engine/test/helpers.js";

/** Recorded from Rakazo a0e5781: identity -> colour id, seven distinct palette entries plus repeats. */
const COLOR_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["fixture-0", "green"],
  ["fixture-1", "gray"],
  ["fixture-2", "orange"],
  ["fixture-3", "gray"],
  ["fixture-4", "magenta"],
  ["fixture-5", "yellow"],
  ["fixture-6", "gray"],
  ["fixture-7", "green"],
  ["fixture-8", "brown"],
  ["fixture-9", "yellow"],
  ["fixture-10", "yellow"],
  ["fixture-11", "white"],
];

describe("frozen upstream fixture", () => {
  it("reproduces every recorded seed", () => {
    for (const row of fixtureRows) {
      expect(avatarSeed(row.identity)).toBe(row.seed);
    }
  });

  it("reproduces every recorded family", () => {
    for (const row of fixtureRows) {
      expect(avatarFamily(row.seed, organicBlob.shapes)).toBe(row.family);
    }
  });

  it("reproduces every recorded look", () => {
    for (const row of fixtureRows) {
      expect(avatarLook(row.family, organicBlob.shapes)).toBe(row.look);
    }
  });

  it("matches every recorded spec row", () => {
    for (const row of fixtureRows) {
      const spec = buildAvatarSpec(organicBlob, row.identity);
      expect(spec.seed).toBe(row.seed);
      expect(spec.family).toBe(row.family);
      expect(spec.look).toBe(row.look);
      expect(spec.path).toBe(row.path);
    }
  });

  it("matches the recorded colour for each identity", () => {
    for (const [identity, expected] of COLOR_PAIRS) {
      expect(organicBlob.palette[colorIndex(identity, organicBlob.palette.length)]?.id).toBe(
        expected,
      );
    }
  });

  it("reproduces every recorded path through outlinePath", () => {
    for (const row of fixtureRows) {
      const shape = organicBlob.shapes[row.family]!;
      expect(
        outlinePath(shape.outline, {
          phase: phaseForSeed(row.seed),
          smoothingPasses: shape.smoothingPasses,
        }),
      ).toBe(row.path);
    }
  });

  it("records identities whose hash lands on the reserved family", () => {
    expect(fixtureRows.some((row) => row.family === 6)).toBe(true);
  });
});
