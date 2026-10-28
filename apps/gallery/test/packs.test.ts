import { describe, expect, it } from "vitest";
import { PROFILE_SAMPLES, avatarSampleIdentity, buildGeometry } from "@botavatar/engine";
import { organicBlob, palette } from "@botavatar/pack-organic-blob";
import { galleryPacks } from "../src/packs.js";
import { art, artEyes, artPalette, artShapes, SHAPE_SCALE } from "../src/packs/art.js";
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

/** Area enclosed by a radial profile, for comparing visual weight. */
function profileArea(radii: readonly number[]): number {
  let area = 0;
  for (let index = 0; index < radii.length; index++) {
    const next = (index + 1) % radii.length;
    area += radii[index]! * radii[next]! * Math.sin((Math.PI * 2) / radii.length);
  }
  return area / 2;
}

/** Indices whose sample is strictly larger than both neighbours on the 64-wheel. */
function localPeaks(radii: readonly number[]): number[] {
  return radii
    .map((radius, index) =>
      radius > radii[(index - 1 + radii.length) % radii.length]! &&
      radius > radii[(index + 1) % radii.length]!
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
}

describe("art demo pack", () => {
  it("is an eight-shape, twelve-colour radii pack", () => {
    expect(art.id).toBe("art");
    expect(art.name).toBe("Art");
    expect(art.version).toBe("0.1.0");
    expect(art.viewBox).toBe("-60 -60 120 120");
    expect(art.assignment).toBe("hash-only");
    expect(art.surface).toBeUndefined();
    expect(art.shapes).toHaveLength(8);
    expect(art.palette).toHaveLength(12);
    expect(art.motion.durationMsByFamily).toHaveLength(8);
    expect(art.motion.clipByFamily).toHaveLength(8);

    for (const shape of art.shapes) {
      expect(shape.outline).toBeUndefined();
      expect(shape.radii).toHaveLength(PROFILE_SAMPLES);
      expect(shape.radii!.every((radius) => Number.isFinite(radius) && radius > 0)).toBe(true);
    }
  });

  it("normalizes every shape to its documented visual weight", () => {
    expect(artShapes.map((shape) => shape.id)).toEqual([
      "circle",
      "pebble",
      "squircle",
      "capsule",
      "triangle",
      "hexagon",
      "cloud",
      "droplet",
    ]);
    expect(artShapes.map((shape) => shape.target)).toEqual([1, 1.02, 1.15, 1, 1, 1, 1.02, 1.04]);
    for (const shape of artShapes) {
      expect(Math.max(...shape.radii)).toBeCloseTo(SHAPE_SCALE * shape.target, 6);
    }
  });

  it("keeps the squircle no lighter than the circle, so it cannot read as small", () => {
    const circle = artShapes[0]!.radii;
    const squircle = artShapes[2]!.radii;
    // Normalizing a superellipse by its diagonal peak makes its axis shorter than the
    // circle's; 1.15 buys back enough area that the square does not read smaller.
    expect(squircle[0]!).toBeGreaterThan(circle[0]! * 0.94);
    expect(profileArea(squircle)).toBeGreaterThanOrEqual(profileArea(circle));
  });

  it("keeps the hexagon's six corners distinct", () => {
    const hexagon = artShapes[5]!.radii;
    const peaks = localPeaks(hexagon);
    expect(peaks).toHaveLength(6);
    // Corners stay real: the profile still dips at the flat edges. A smoothed-away
    // hexagon would approach a constant radius.
    expect(Math.min(...hexagon) / Math.max(...hexagon)).toBeGreaterThan(0.85);
  });

  it("makes the pebble an irregular stone, not a crushed balloon", () => {
    const pebble = artShapes[1]!.radii;
    const max = Math.max(...pebble);
    const min = Math.min(...pebble);
    // Two low harmonics, exactly as the evidence doc describes: a small perturbation.
    expect(min / max).toBeGreaterThan(0.78);
    expect(min / max).toBeLessThan(0.85);
    expect(localPeaks(pebble).length).toBeLessThanOrEqual(3);
    expect(max - min).toBeGreaterThan(0.15 * max);
  });

  it("carries the sphere rig and derives the face from each profile", () => {
    expect(artEyes.sphereRadius).toBe(44);
    expect(artEyes.bodyCoupling).toBe(0.35);
    expect(artEyes.bodyPitchFollow).toBe(0.35);
    expect(artEyes.restTiltDeg).toBe(-4);
    expect(artEyes.fadeFromDepth).toBe(0.12);
    expect(artEyes.cullAtDepth).toBe(0.02);
    expect((art.eyes as unknown as { kind?: string }).kind).toBe("sphere");

    for (let family = 0; family < art.shapes.length; family++) {
      const geometry = buildGeometry(art, avatarSampleIdentity(art, family));
      expect(geometry.family).toBe(family);
      expect(geometry.body.radii).toHaveLength(PROFILE_SAMPLES);
      if (geometry.rig.kind !== "sphere") throw new Error("art is a sphere pack");
      const [left, right] = geometry.rig.eyes;
      expect(left.halfWidth).toBeGreaterThan(0);
      expect(left.halfHeight).toBeGreaterThan(0);
      expect(left.halfWidth).toBeCloseTo(right.halfWidth, 6);
      expect(left.lateralDeg).toBeCloseTo(-right.lateralDeg, 6);
      expect(left.tiltDeg).toBe(-4);
      expect(right.tiltDeg).toBe(-4);
      expect(geometry.rig.anchorY).toBeLessThan(0);
    }
  });

  it("spans dark to light with twelve distinct colours", () => {
    const ids = new Set(artPalette.map((color) => color.id));
    expect(ids.size).toBe(12);
    for (const color of artPalette) {
      expect(color.light).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.dark).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.eye).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.light).not.toBe(color.dark);
    }
    const luminance = (hex: string): number => {
      const channels = [1, 3, 5].map((offset) => {
        const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const inks = artPalette.map((color) => luminance(color.dark));
    expect(Math.min(...inks)).toBeLessThan(0.02);
    expect(luminance(artPalette.find((color) => color.id === "cream")!.light)).toBeGreaterThan(0.8);
  });

  it("appears once in the switcher, labelled from its file", () => {
    const entries = galleryPacks();
    expect(entries.filter((entry) => entry.pack.id === "art")).toHaveLength(1);
    expect(entries.find((entry) => entry.pack.id === "art")?.label).toBe("Art (art)");
  });
});
