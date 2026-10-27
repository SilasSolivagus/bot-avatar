import { describe, expect, it } from "vitest";
import { outlinePath, phaseForSeed } from "@botavatar/engine";
import { fixtureRows } from "../../../engine/test/helpers.js";
import { eyes } from "../src/eyes.js";
import { organicBlob } from "../src/index.js";
import { palette } from "../src/palette.js";
import { shapes } from "../src/shapes.js";

describe("organic blob pack", () => {
  it("declares ten families with the reserved heart and the merged look", () => {
    expect(shapes).toHaveLength(10);
    expect(shapes[6]?.reserved).toBe(true);
    expect(shapes[8]?.look).toBe(2);
    expect(shapes.filter((shape) => shape.reserved)).toHaveLength(1);
  });

  it("gives the procedural families one smoothing pass and the literal ones two", () => {
    expect([3, 4, 5].map((index) => shapes[index]?.smoothingPasses)).toEqual([1, 1, 1]);
    expect(shapes[0]?.smoothingPasses ?? 2).toBe(2);
  });

  it("carries the eleven upstream colours in order", () => {
    expect(palette.map((color) => color.id)).toEqual([
      "white", "violet", "green", "orange", "cyan", "blue",
      "yellow", "brown", "red", "magenta", "gray",
    ]);
    expect(palette[1]).toEqual({
      id: "violet",
      name: "Executive Violet",
      light: "#A97EFE",
      dark: "#7C3AED",
      eye: "#141414",
      hex: "#8B5CF6",
    });
  });

  it("declares two 7x24 eyes rotated within nine steps", () => {
    expect(eyes.eyes).toEqual([
      { kind: "rect", x: -14, y: -12, width: 7, height: 24, rx: 3.5 },
      { kind: "rect", x: 7, y: -12, width: 7, height: 24, rx: 3.5 },
    ]);
    expect(eyes.rotation).toEqual({ modulo: 9, spread: 4 });
  });

  it("declares one duration per family", () => {
    expect(organicBlob.motion.durationMsByFamily).toEqual([
      1800, 1350, 1600, 2400, 2400, 1350, 1100, 1350, 1600, 1350,
    ]);
  });

  it("is a complete, self-describing pack", () => {
    expect(organicBlob.id).toBe("organic-blob");
    expect(organicBlob.version).toBe("1.0.0");
    expect(organicBlob.viewBox).toBe("-60 -60 120 120");
    expect(organicBlob.assignment).toBe("hash-only");
    expect(organicBlob.shapes).toBe(shapes);
    expect(organicBlob.palette).toBe(palette);
  });

  it("declares no surface, so it renders flat", () => {
    expect(organicBlob.surface).toBeUndefined();
  });

  it("reproduces every recorded upstream path", () => {
    for (const row of fixtureRows) {
      const shape = shapes[row.family]!;
      expect(
        outlinePath(shape.outline, {
          phase: phaseForSeed(row.seed),
          smoothingPasses: shape.smoothingPasses,
        }),
      ).toBe(row.path);
    }
  });
});
