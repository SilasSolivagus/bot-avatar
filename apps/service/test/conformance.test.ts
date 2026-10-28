import { describe, expect, it } from "vitest";
import type { StylePack } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { assertPackRenders } from "../src/conformance.js";
import { PackError } from "../src/packs.js";
import { spherePackAsStylePack } from "./sphere-pack.js";

/**
 * A synthetic pack with the requested dimensions. Shapes and colours repeat the
 * builtin entries; only the counts matter to the sweep.
 */
function syntheticPack(shapeCount: number, colorCount: number): StylePack {
  const base = structuredClone(organicBlob);
  const durations = base.motion.durationMsByFamily;
  return {
    ...base,
    shapes: Array.from({ length: shapeCount }, () => structuredClone(base.shapes[0]!)),
    palette: Array.from({ length: colorCount }, (_, index) =>
      structuredClone(base.palette[index % base.palette.length]!),
    ),
    motion: {
      ...base.motion,
      durationMsByFamily: Array.from(
        { length: shapeCount },
        (_, index) => durations[index % durations.length]!,
      ),
    },
  };
}

describe("assertPackRenders", () => {
  it("renders every family and colour of the builtin pack", () => {
    const result = assertPackRenders(organicBlob, "builtin");
    expect(result.sampled).toBe(false);
    expect(result.rendered).toBe(organicBlob.shapes.length * organicBlob.palette.length * 2);
  });

  it("catches a pack that only breaks on its third colour", () => {
    const broken = structuredClone(organicBlob);
    (broken.palette[2] as { eye: unknown }).eye = undefined;
    expect(() => assertPackRenders(broken, "/tmp/third-colour.ts")).toThrow(PackError);
    expect(() => assertPackRenders(broken, "/tmp/third-colour.ts")).toThrow(/third-colour\.ts/);
  });

  it("catches a body that only breaks on one family", () => {
    const broken = structuredClone(organicBlob);
    (broken.shapes[7] as { outline: unknown }).outline = [[Number.NaN, 0], [0, 0], [0, 10]];
    expect(() => assertPackRenders(broken, "x")).toThrow(PackError);
  });

  it("catches every leaked sentinel in otherwise valid markup", () => {
    for (const token of ["NaN", "undefined", "Infinity", "[object Object]"]) {
      const broken = structuredClone(organicBlob);
      (broken.palette[0] as { light: string }).light = token;
      expect(() => assertPackRenders(broken, "sentinel"), token).toThrow(token);
    }
  });

  it("samples and says so when the domain is too large", () => {
    const huge = {
      ...structuredClone(organicBlob),
      palette: Array.from({ length: 60 }, () => organicBlob.palette[0]!),
    };
    const result = assertPackRenders(huge, "huge");
    expect(result.sampled).toBe(true);
    expect(result.rendered).toBeLessThanOrEqual(1000);
  });

  it("samples across the whole domain, so a broken last family is still caught", () => {
    const broken = {
      ...structuredClone(organicBlob),
      palette: Array.from(
        { length: 60 },
        (_, index) => organicBlob.palette[index % organicBlob.palette.length]!,
      ),
    };
    const lastFamily = broken.shapes.length - 1;
    (broken.shapes[lastFamily] as { outline: unknown }).outline = [
      [Number.NaN, 0],
      [0, 0],
      [0, 10],
    ];
    expect(() => assertPackRenders(broken, "last-family")).toThrow(PackError);
    expect(() => assertPackRenders(broken, "last-family")).toThrow(new RegExp(`family ${lastFamily}`));
  });

  it("renders palette[1] of a 700-shape, 4-colour pack", () => {
    const broken = syntheticPack(700, 4);
    (broken.palette[1] as { eye: unknown }).eye = undefined;
    expect(() => assertPackRenders(broken, "700x4-palette-1")).toThrow(PackError);
  });

  it("covers every colour of a 700-shape, 4-colour sampled pack", () => {
    const pack = syntheticPack(700, 4);
    const result = assertPackRenders(pack, "700x4");
    expect(result.sampled).toBe(true);
    expect(result.rendered).toBeLessThanOrEqual(1000);
    expect(result.uncovered.colors).toEqual([]);
    for (let color = 0; color < pack.palette.length; color += 1) {
      const broken = syntheticPack(700, 4);
      (broken.palette[color] as { eye: unknown }).eye = undefined;
      expect(() => assertPackRenders(broken, `700x4-colour-${color}`), `colour ${color}`).toThrow(
        PackError,
      );
    }
  });

  it("covers every shape and colour of a 60-shape, 20-colour sampled pack", () => {
    const pack = syntheticPack(60, 20);
    const result = assertPackRenders(pack, "60x20");
    expect(result.sampled).toBe(true);
    expect(result.rendered).toBeLessThanOrEqual(1000);
    expect(result.uncovered).toEqual({ shapes: [], colors: [] });

    for (let color = 0; color < pack.palette.length; color += 1) {
      const broken = syntheticPack(60, 20);
      (broken.palette[color] as { eye: unknown }).eye = undefined;
      expect(() => assertPackRenders(broken, `60x20-colour-${color}`), `colour ${color}`).toThrow(
        PackError,
      );
    }
    for (let family = 0; family < pack.shapes.length; family += 1) {
      const broken = syntheticPack(60, 20);
      (broken.shapes[family] as { outline: unknown }).outline = [
        [Number.NaN, 0],
        [0, 0],
        [0, 10],
      ];
      expect(() => assertPackRenders(broken, `60x20-shape-${family}`), `shape ${family}`).toThrow(
        new RegExp(`family ${family}`),
      );
    }
  });

  it("stays exhaustive for a 10-shape, 11-colour pack", () => {
    const result = assertPackRenders(syntheticPack(10, 11), "small");
    expect(result.sampled).toBe(false);
    expect(result.rendered).toBe(220);
    expect(result.uncovered).toEqual({ shapes: [], colors: [] });
  });

  it("reports the exact uncovered shape ranges when shapes exceed the budget", () => {
    const result = assertPackRenders(syntheticPack(600, 1), "600x1");
    const expected = [
      ...Array.from({ length: 99 }, (_, index) => {
        const at = 6 * index + 5;
        return { start: at, end: at };
      }),
      { start: 598, end: 598 },
    ];
    expect(result.sampled).toBe(true);
    expect(result.rendered).toBe(1000);
    expect(result.uncovered.colors).toEqual([]);
    expect(result.uncovered.shapes).toEqual(expected);
    const uncovered = result.uncovered.shapes.reduce(
      (total, range) => total + range.end - range.start + 1,
      0,
    );
    expect(uncovered).toBe(100);
  });

  it("still throws for a break in a late shape of a large pack", () => {
    const pack = syntheticPack(700, 4);
    const lastFamily = pack.shapes.length - 1;
    (pack.shapes[lastFamily] as { outline: unknown }).outline = [
      [Number.NaN, 0],
      [0, 0],
      [0, 10],
    ];
    expect(() => assertPackRenders(pack, "late-shape")).toThrow(new RegExp(`family ${lastFamily}`));
  });

  it("reaches the last family even when the stride is wider than the palette", () => {
    const crowded = {
      ...structuredClone(organicBlob),
      shapes: Array.from(
        { length: 600 },
        (_, index) => structuredClone(organicBlob.shapes[index % organicBlob.shapes.length]!),
      ),
      palette: organicBlob.palette.slice(0, 5),
    };
    const lastFamily = crowded.shapes.length - 1;
    (crowded.shapes[lastFamily] as { outline: unknown }).outline = [
      [Number.NaN, 0],
      [0, 0],
      [0, 10],
    ];
    expect(() => assertPackRenders(crowded, "wide-stride")).toThrow(
      new RegExp(`family ${lastFamily}`),
    );
  });
});

describe("assertPackRenders sphere packs", () => {
  it("sweeps every family and colour in the five sphere poses", () => {
    const result = assertPackRenders(spherePackAsStylePack({ shapes: 2, colors: 3 }), "sphere");
    expect(result.sampled).toBe(false);
    expect(result.rendered).toBe(2 * 3 * 5);
    expect(result.uncovered).toEqual({ shapes: [], colors: [] });
  });

  it("names family, colour and pose when a sphere render leaks a sentinel", () => {
    const pack = spherePackAsStylePack({ shapes: 2, colors: 2 });
    (pack.palette[0] as { eye: unknown }).eye = "undefined";
    expect(() => assertPackRenders(pack, "/tmp/sphere-sentinel.ts")).toThrow(PackError);
    expect(() => assertPackRenders(pack, "/tmp/sphere-sentinel.ts")).toThrow(
      /family 0 colour 0 pose 0/,
    );
  });

  it("rejects a sphere pack whose capsule escapes the silhouette", () => {
    const pack = spherePackAsStylePack({ shapes: 1, colors: 1 });
    (pack.shapes[0] as { outline: unknown }).outline = [
      [20, 20],
      [40, 20],
      [40, 40],
      [20, 40],
    ];
    expect(() => assertPackRenders(pack, "/tmp/sphere-escape.ts")).toThrow(PackError);
    expect(() => assertPackRenders(pack, "/tmp/sphere-escape.ts")).toThrow(
      /family 0 colour 0 pose 0/,
    );
    expect(() => assertPackRenders(pack, "/tmp/sphere-escape.ts")).toThrow(/outline/);
  });

  it("rejects a sphere pack whose eyes coincide at extreme yaw", () => {
    // The radius is positive, but so small that both projected centres round to
    // the same drawn point: a rig with no visible separation at all.
    const pack = spherePackAsStylePack({ shapes: 1, colors: 1, eyes: { sphereRadius: 0.001 } });
    expect(() => assertPackRenders(pack, "/tmp/sphere-coincide.ts")).toThrow(PackError);
    expect(() => assertPackRenders(pack, "/tmp/sphere-coincide.ts")).toThrow(
      /family 0 colour 0 pose 1/,
    );
    expect(() => assertPackRenders(pack, "/tmp/sphere-coincide.ts")).toThrow(/coincide/);
  });

  it("samples a sphere sweep above the render cap and says so", () => {
    const result = assertPackRenders(spherePackAsStylePack({ shapes: 41, colors: 6 }), "big-sphere");
    expect(result.sampled).toBe(true);
    expect(result.rendered).toBe(1000);
    expect(result.uncovered).toEqual({ shapes: [], colors: [] });
  });
});
