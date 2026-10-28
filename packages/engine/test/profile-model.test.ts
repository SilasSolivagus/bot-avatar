import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { buildGeometry } from "../src/build-geometry.js";
import { deriveFace, radiusAtAngle } from "../src/face.js";
import { toGeometry } from "../src/geometry-from-spec.js";
import { closedCurvePath } from "../src/outline.js";
import {
  PROFILE_SAMPLES,
  normalizeRadii,
  radiiToPath,
  radiiToPoints,
  radiusAtRadii,
  regularPolygonProfile,
  superellipseProfile,
} from "../src/profile.js";
import { buildAvatarSpec, radiiShape } from "../src/spec.js";
import type { StylePack } from "../src/spec.js";
import { fixtureRows } from "./helpers.js";

const TWO_PI = Math.PI * 2;

const hexagon = normalizeRadii(regularPolygonProfile(6, 1, 0.26), 46);
const squircle = normalizeRadii(superellipseProfile(4), 46);

/** A pack whose families are `radii` profiles; the eyes/motion stay organic-blob's. */
const radiusPack: StylePack = {
  ...organicBlob,
  id: "radius-pack",
  name: "Radius Pack",
  version: "0.1.0",
  shapes: [radiiShape(hexagon), radiiShape(squircle)],
};

/** The same radii families with a sphere eye rig, so `deriveFace` is exercised. */
const sphereRadiusPack = {
  ...radiusPack,
  id: "radius-orb",
  eyes: {
    kind: "sphere",
    sphereRadius: 44,
    eyes: [
      { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: -6 },
      { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 6 },
    ],
    fadeFromDepth: 0.12,
    cullAtDepth: 0.02,
    bodyCoupling: 0.35,
  },
} as unknown as StylePack;

/** The ±50° frontal window, read straight from the 64 samples. */
function frontalMinimumFromSamples(radii: readonly number[]): number {
  let minimum = Infinity;
  for (let index = 0; index < radii.length; index++) {
    const angle = (index / radii.length) * TWO_PI;
    const distance = Math.min(angle, TWO_PI - angle);
    if (distance > (50 * Math.PI) / 180 + 1e-9) continue;
    if (radii[index]! < minimum) minimum = radii[index]!;
  }
  return minimum;
}

describe("radiiToPath", () => {
  it("draws a smooth closed cubic through all 64 samples", () => {
    const path = radiiToPath(hexagon);
    expect(path.startsWith("M")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(PROFILE_SAMPLES);
    expect(path).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("uses the same curve construction as the polygon path", () => {
    // No phase distortion and no Chaikin smoothing: the 64 samples go straight into the
    // shared closed Catmull-Rom builder that `outlinePath` also ends with.
    expect(radiiToPath(hexagon)).toBe(
      closedCurvePath(radiiToPoints(hexagon).map(([x, y]) => ({ x, y }))),
    );
  });

  it("is deterministic", () => {
    expect(radiiToPath(squircle)).toBe(radiiToPath(squircle));
  });
});

describe("radiusAtRadii", () => {
  const ladder = Array.from({ length: PROFILE_SAMPLES }, (_, index) => index + 1);

  it("returns the sample itself on a sample angle", () => {
    expect(radiusAtRadii(ladder, 0)).toBeCloseTo(1, 9);
    expect(radiusAtRadii(ladder, TWO_PI / PROFILE_SAMPLES)).toBeCloseTo(2, 9);
    expect(radiusAtRadii(ladder, (10 * TWO_PI) / PROFILE_SAMPLES)).toBeCloseTo(11, 9);
  });

  it("interpolates linearly between adjacent samples", () => {
    const halfway = TWO_PI / PROFILE_SAMPLES / 2;
    expect(radiusAtRadii(ladder, halfway)).toBeCloseTo(1.5, 9);
    expect(radiusAtRadii(ladder, halfway + TWO_PI / PROFILE_SAMPLES)).toBeCloseTo(2.5, 9);
  });

  it("wraps angles beyond one turn and below zero", () => {
    expect(radiusAtRadii(ladder, TWO_PI)).toBeCloseTo(1, 9);
    expect(radiusAtRadii(ladder, -TWO_PI / PROFILE_SAMPLES)).toBeCloseTo(PROFILE_SAMPLES, 9);
    expect(radiusAtRadii(ladder, TWO_PI + TWO_PI / PROFILE_SAMPLES)).toBeCloseTo(2, 9);
  });

  it("is what radiusAtAngle uses for a radii profile", () => {
    expect(radiusAtAngle(hexagon, 0)).toBeCloseTo(radiusAtRadii(hexagon, 0), 12);
    expect(radiusAtAngle(hexagon, 0)).toBeCloseTo(hexagon[0]!, 12);
    // The polygon representation still takes the ray/segment path.
    expect(radiusAtAngle(radiiToPoints(hexagon), 0)).toBeCloseTo(hexagon[0]!, 9);
  });
});

describe("deriveFace with radii", () => {
  it("takes the minimum radius over the ±50° window straight from the samples", () => {
    const face = deriveFace(hexagon);
    const expected = frontalMinimumFromSamples(hexagon);
    expect(face.rMin).toBeCloseTo(expected, 12);
    expect(face.dy).toBeCloseTo(-0.14 * expected, 12);
  });

  it("is scale-free, like the outline path", () => {
    const face = deriveFace(hexagon);
    const doubled = deriveFace(hexagon.map((radius) => radius * 2));
    expect(doubled.rMin).toBeCloseTo(face.rMin * 2, 9);
    expect(doubled.halfHeight).toBeCloseTo(face.halfHeight, 9);
  });

  it("is deterministic", () => {
    expect(deriveFace(hexagon)).toEqual(deriveFace(hexagon));
  });
});

describe("rejects a malformed radii profile", () => {
  it("requires exactly 64 positive, finite samples with a finite sum", () => {
    expect(() => radiiToPath(hexagon.slice(0, 63))).toThrow(RangeError);
    expect(() => radiiToPath([...hexagon, 1])).toThrow(RangeError);
    expect(() => radiiToPath([...hexagon.slice(0, 63), 0])).toThrow(RangeError);
    expect(() => radiiToPath([...hexagon.slice(0, 63), -1])).toThrow(RangeError);
    expect(() => radiiToPath([...hexagon.slice(0, 63), NaN])).toThrow(RangeError);
    expect(() => radiiToPath([...hexagon.slice(0, 63), Infinity])).toThrow(RangeError);
    expect(() => radiiToPath(new Array(PROFILE_SAMPLES).fill(1e308))).toThrow(RangeError);
    expect(() => radiusAtRadii(hexagon.slice(0, 63), 0)).toThrow(RangeError);
    expect(() => deriveFace(hexagon.slice(0, 63))).toThrow(RangeError);
  });
});

describe("buildGeometry with radii", () => {
  it("passes the profile through on the body", () => {
    const geometry = buildGeometry(radiusPack, "alice");
    const family = radiusPack.shapes[geometry.family]!;
    expect(family.radii).toHaveLength(PROFILE_SAMPLES);
    expect(geometry.body.radii).toEqual(family.radii);
    // The polygon view is derived, for consumers that have not switched to `radii`.
    expect(geometry.body.outline).toEqual(radiiToPoints(family.radii!));
  });

  it("builds the spec path from the profile, not from a smoothed polygon", () => {
    const spec = buildAvatarSpec(radiusPack, "alice");
    const family = radiusPack.shapes[spec.family]!;
    expect(spec.path).toBe(radiiToPath(family.radii!));
  });

  it("agrees with the spec adapter, like the polygon path does", () => {
    for (const identity of ["alice", "bob", "wall-3-0", "account-42"]) {
      expect(buildGeometry(radiusPack, identity)).toEqual(
        toGeometry(radiusPack, buildAvatarSpec(radiusPack, identity)),
      );
    }
  });

  it("derives a sphere rig's face from the radii samples", () => {
    const geometry = buildGeometry(sphereRadiusPack, "alice");
    if (geometry.rig.kind !== "sphere") throw new Error("unreachable");
    const family = sphereRadiusPack.shapes[geometry.family]!;
    const face = deriveFace(family.radii!, { sphereRadius: geometry.rig.sphereRadius });
    expect(geometry.rig.anchorY).toBe(face.dy);
    expect(geometry.rig.eyes[0]).toMatchObject({
      lateralDeg: face.splitDeg,
      halfWidth: face.halfWidth,
      halfHeight: face.halfHeight,
    });
    expect(geometry.rig.eyes[1]!.lateralDeg).toBe(-face.splitDeg);
  });

  it("does not give a polygon body a radii field", () => {
    const geometry = buildGeometry(organicBlob, "alice");
    expect(geometry.body.radii).toBeUndefined();
  });
});

describe("the polygon path is untouched", () => {
  it("reproduces every upstream fixture path byte for byte", () => {
    for (const row of fixtureRows) {
      const spec = buildAvatarSpec(organicBlob, row.identity);
      expect(spec.family).toBe(row.family);
      expect(spec.path).toBe(row.path);
    }
  });
});
