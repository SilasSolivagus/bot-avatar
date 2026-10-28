import { describe, expect, it } from "vitest";
import { avatarSampleIdentity, buildGeometry } from "@botavatar/engine";
import { organicBlob, palette } from "@botavatar/pack-organic-blob";
import { galleryPacks } from "../src/packs.js";
import { clay } from "../src/packs/clay.js";
import { geo, geoEyes, geoShapes } from "../src/packs/geo.js";
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
    // The pack must not hand-tune the face: `buildGeometry` replaces every one of
    // these with a value derived from the outline.
    expect(orbEyes.eyes[0]).toEqual({
      lateralDeg: 0,
      verticalDeg: 0,
      halfWidth: 0,
      halfHeight: 0,
      tiltDeg: 0,
    });
    expect(orbEyes.fadeFromDepth).toBeGreaterThan(0);
    expect(orbEyes.cullAtDepth).toBeLessThan(orbEyes.fadeFromDepth);
    expect(orbEyes.bodyCoupling).toBe(0.35);
  });

  it("splits the turn and the nod with the head, with a parallel rest tilt", () => {
    expect(orbEyes.bodyPitchFollow).toBe(0.35);
    expect(orbEyes.restTiltDeg).toBe(-4);
    const geometry = buildGeometry(orb, "alice");
    if (geometry.rig.kind !== "sphere") throw new Error("orb is a sphere pack");
    expect(geometry.rig.bodyPitchFollow).toBe(0.35);
    expect(geometry.rig.restTiltDeg).toBe(-4);
    // Both eyes tilt the same way; the pair is parallel, never mirrored.
    expect(geometry.rig.eyes[0].tiltDeg).toBe(-4);
    expect(geometry.rig.eyes[1].tiltDeg).toBe(-4);
    // And the pair opens symmetrically, with the size derived from the outline.
    expect(geometry.rig.eyes[0].lateralDeg).toBeCloseTo(-geometry.rig.eyes[1].lateralDeg, 6);
    expect(geometry.rig.eyes[0].halfWidth).toBeCloseTo(geometry.rig.eyes[1].halfWidth, 6);
    expect(geometry.rig.eyes[0].halfWidth).toBeGreaterThan(0);
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

describe("geo demo pack", () => {
  it("is a sphere pack with two shapes and its own id and version", () => {
    expect(geo.id).toBe("geo");
    expect(geo.version).toBe("0.1.0");
    expect(geo.viewBox).toBe("-60 -60 120 120");
    expect(geo.shapes).toHaveLength(2);
    expect(geo.motion.clipByFamily).toHaveLength(2);
    expect(geo.motion.durationMsByFamily).toHaveLength(2);
    expect(geo.assignment).toBe("hash-only");
    expect(geo.surface).toBeUndefined();
    expect((geo.eyes as unknown as { kind?: string }).kind).toBe("sphere");
  });

  it("samples the squircle every 7.5° and the capsule from its stadium outline", () => {
    const [squircle, capsule] = geoShapes;
    expect(squircle!.smoothingPasses).toBe(1);
    expect(squircle!.outline).toHaveLength(48);
    // Half-extent 46 on the axes; exponent 4 puts the corner at 46·2^(1/4) ≈ 54.7.
    expect(squircle!.outline[0]).toEqual([46, 0]);
    expect(squircle!.outline[12]![1]).toBeCloseTo(46, 6);
    const corner = squircle!.outline[6]!;
    expect(Math.hypot(corner[0], corner[1])).toBeCloseTo(46 * 2 ** 0.25, 6);

    expect(capsule!.smoothingPasses).toBe(1);
    // Top and bottom caps are sampled every 7.5°, endpoints included: 25 points each.
    expect(capsule!.outline).toHaveLength(50);
    // The stadium is 34 half-wide and 52 half-high, with a semicircular cap.
    expect(Math.max(...capsule!.outline.map(([x]) => Math.abs(x)))).toBeCloseTo(34, 6);
    expect(Math.max(...capsule!.outline.map(([, y]) => y))).toBeCloseTo(52, 6);
    expect(Math.min(...capsule!.outline.map(([, y]) => y))).toBeCloseTo(-52, 6);
    // A cap midpoint (top) is on the circle of radius 34 centred at (0, -18).
    expect(capsule!.outline[12]![0]).toBeCloseTo(0, 6);
    expect(capsule!.outline[12]![1]).toBeCloseTo(-52, 6);
  });

  it("reuses organic-blob's eleven colours instead of copying them", () => {
    expect(geo.palette).toBe(palette);
    expect(geo.palette).toHaveLength(11);
  });

  it("carries the gallery's optics: 35% head turn, 35% nod, -4° parallel tilt", () => {
    expect(geoEyes.sphereRadius).toBe(44);
    expect(geoEyes.bodyCoupling).toBe(0.35);
    expect(geoEyes.bodyPitchFollow).toBe(0.35);
    expect(geoEyes.restTiltDeg).toBe(-4);
    expect(geoEyes.fadeFromDepth).toBe(0.12);
    expect(geoEyes.cullAtDepth).toBe(0.02);
  });

  it("derives the eyes from each outline instead of declaring them", () => {
    const halfWidths: number[] = [];
    for (const family of [0, 1] as const) {
      const identity = avatarSampleIdentity(geo, family);
      const geometry = buildGeometry(geo, identity);
      expect(geometry.family).toBe(family);
      if (geometry.rig.kind !== "sphere") throw new Error("geo is a sphere pack");
      const [left, right] = geometry.rig.eyes;
      halfWidths.push(left.halfWidth);
      expect(left.halfWidth).toBeGreaterThan(0);
      expect(left.halfHeight).toBeGreaterThan(0);
      expect(left.halfWidth).toBeCloseTo(right.halfWidth, 6);
      expect(left.halfHeight).toBeCloseTo(right.halfHeight, 6);
      expect(left.lateralDeg).toBeCloseTo(-right.lateralDeg, 6);
      expect(left.tiltDeg).toBe(-4);
      expect(right.tiltDeg).toBe(-4);
      // The face sits slightly above the outline's centre, as on the orb.
      expect(geometry.rig.anchorY).toBeLessThan(0);
    }
    // Two species, two faces: the squircle has more room than the stadium at the
    // cheeks, so its eyes must come out larger. That is `deriveFace`, not the pack.
    expect(halfWidths[0]).not.toBeCloseTo(halfWidths[1]!, 3);
  });

  it("appears once in the switcher", () => {
    const ids = galleryPacks().map((entry) => entry.pack.id);
    expect(ids.filter((id) => id === "geo")).toHaveLength(1);
  });
});
