import { describe, expect, it } from "vitest";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { assertPackRenders } from "../src/conformance.js";
import { PackError } from "../src/packs.js";

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
