import { describe, expect, it } from "vitest";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { galleryPacks } from "../src/packs.js";
import { clay } from "../src/packs/clay.js";
import { orb, orbEyes } from "../src/packs/orb.js";

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

describe("orb demo pack", () => {
  it("is a sphere pack with its own id and version", () => {
    expect(orb.id).toBe("orb");
    expect(orb.version).toBe("0.1.0");
    expect(orb.name).toContain("Sphere");
    expect((orb.eyes as unknown as { kind?: string }).kind).toBe("sphere");
  });

  it("carries the sphere rig the renderer reads", () => {
    expect(orbEyes.sphereRadius).toBe(44);
    expect(orbEyes.eyes).toHaveLength(2);
    expect(orbEyes.eyes[0]).toEqual({
      lateralDeg: 18,
      verticalDeg: 0,
      halfWidth: 4.2,
      halfHeight: 12.5,
      tiltDeg: -6,
    });
    expect(orbEyes.eyes[1]).toEqual({ ...orbEyes.eyes[0], lateralDeg: -18, tiltDeg: 6 });
    expect(orbEyes.fadeFromDepth).toBeGreaterThan(0);
    expect(orbEyes.cullAtDepth).toBeLessThan(orbEyes.fadeFromDepth);
  });

  it("reuses organic-blob's bodies, colours, clips and durations", () => {
    expect(orb.shapes).toEqual(organicBlob.shapes);
    expect(orb.palette).toEqual(organicBlob.palette);
    expect(orb.motion).toEqual(organicBlob.motion);
    expect(orb.viewBox).toBe(organicBlob.viewBox);
    expect(orb.assignment).toBe(organicBlob.assignment);
  });

  it("declares no surface material, which a sphere rig cannot render", () => {
    expect(orb.surface).toBeUndefined();
  });

  it("does not shadow organic-blob in the switcher", () => {
    const ids = galleryPacks().map((entry) => entry.pack.id);
    expect(ids[0]).toBe("organic-blob");
    expect(ids.filter((id) => id === "orb")).toHaveLength(1);
  });
});
