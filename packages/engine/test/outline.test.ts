import { describe, expect, it } from "vitest";
import { outlinePath, phaseForSeed } from "../src/outline.js";

const SQUARE: ReadonlyArray<readonly [number, number]> = [
  [0, -10],
  [10, 0],
  [0, 10],
  [-10, 0],
];

describe("phaseForSeed", () => {
  it("spreads a seed over one turn", () => {
    expect(phaseForSeed(0)).toBe(0);
    expect(phaseForSeed(180)).toBeCloseTo(Math.PI, 12);
    expect(phaseForSeed(360)).toBe(0);
    expect(phaseForSeed(361)).toBeCloseTo(Math.PI / 180, 12);
  });
});

describe("outlinePath", () => {
  it("emits path geometry only", () => {
    const path = outlinePath(SQUARE, { phase: 0, smoothingPasses: 0 });
    expect(path).toMatch(/^M[-0-9. ]+(?:C[-0-9. ]+)+Z$/);
    expect(path).not.toMatch(/<|>|url\(|javascript:/i);
  });

  it("emits one cubic per point and closes with Z", () => {
    const path = outlinePath(SQUARE, { phase: 0, smoothingPasses: 0 });
    expect(path.match(/C/g)).toHaveLength(4);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("doubles the point count per smoothing pass", () => {
    const count = (passes: number) =>
      outlinePath(SQUARE, { phase: 0, smoothingPasses: passes }).match(/C/g)!.length;
    expect(count(0)).toBe(4);
    expect(count(1)).toBe(8);
    expect(count(2)).toBe(16);
  });

  it("rounds every emitted number to two decimals", () => {
    const path = outlinePath([[0.123456, -45.987654], [10, 0], [0, 10]], {
      phase: 0,
      smoothingPasses: 0,
    });
    expect(path).not.toMatch(/\d\.\d{3,}/);
  });

  it("distorts by phase, and leaves a point on its axis at phase zero", () => {
    const base = outlinePath(SQUARE, { phase: 0, smoothingPasses: 0 });
    const shifted = outlinePath(SQUARE, { phase: 1.2, smoothingPasses: 0 });
    expect(shifted).not.toBe(base);
    expect(outlinePath([[10, 0]], { phase: 0, smoothingPasses: 0 })).toContain("M10 0");
  });

  it("is a pure function of its arguments", () => {
    expect(outlinePath(SQUARE, { phase: 1.2 })).toBe(outlinePath(SQUARE, { phase: 1.2 }));
  });
});
