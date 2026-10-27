import { describe, expect, it } from "vitest";
import { galleryPacks } from "../src/packs.js";
import { clay } from "../src/packs/clay.js";

describe("galleryPacks", () => {
  it("puts the builtin first and discovers local packs once each", () => {
    const entries = galleryPacks();
    expect(entries[0]!.pack.id).toBe("organic-blob");
    expect(entries.map((entry) => entry.pack.id)).toContain("clay");
    expect(new Set(entries.map((entry) => entry.pack.id)).size).toBe(entries.length);
  });

  it("labels a local pack with the file it came from", () => {
    const clay = galleryPacks().find((entry) => entry.pack.id === "clay");
    expect(clay?.label).toBe("Clay (clay)");
  });
});

describe("clay demo pack", () => {
  it("has enough shapes and colours for a varied 40-identity wall", () => {
    expect(clay.shapes).toHaveLength(6);
    expect(clay.palette).toHaveLength(8);
    expect(clay.shapes.length * clay.palette.length).toBe(48);
  });

  it("assigns exactly one clip and one duration per family", () => {
    expect(clay.motion.clipByFamily).toHaveLength(clay.shapes.length);
    expect(clay.motion.durationMsByFamily).toHaveLength(clay.shapes.length);
    expect(new Set(clay.motion.clipByFamily)).toEqual(
      new Set(["breathe", "blink", "sway", "look-round", "bob", "tilt"]),
    );
  });
});
