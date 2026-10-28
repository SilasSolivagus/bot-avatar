import { describe, expect, it } from "vitest";
import { deriveFace, radiusAtAngle } from "../src/face.js";
import type { Point } from "../src/geometry.js";

/** A square of side 92: the ray at 45° reaches the corner, √(46² + 46²). */
const square: ReadonlyArray<Point> = [
  [-46, -46],
  [46, -46],
  [46, 46],
  [-46, 46],
];

/** A superellipse with exponent 4, half-size 36 — the "squircle" family. */
const squircle: ReadonlyArray<Point> = Array.from({ length: 24 }, (_, index) => {
  const angle = (index / 24) * Math.PI * 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const power = 2 / 4;
  return [
    Math.sign(cos) * Math.abs(cos) ** power * 36,
    Math.sign(sin) * Math.abs(sin) ** power * 36,
  ] as const;
});

/** A five-point star: ten alternating radii, like the gallery's clay star. */
const star: ReadonlyArray<Point> = [
  [0, -48], [11.76, -16.18], [45.65, -14.83], [19.02, 6.18], [28.21, 38.83],
  [0, 20], [-28.21, 38.83], [-19.02, 6.18], [-45.65, -14.83], [-11.76, -16.18],
];

/** A tall, narrow rectangle: the aesthetic spread asks for more than the cheek has. */
const narrow: ReadonlyArray<Point> = [
  [-10, -50],
  [10, -50],
  [10, 50],
  [-10, 50],
];

/** A cloud: organic-blob's lobed round body, whose radius stays large all round. */
const cloud: ReadonlyArray<Point> = [
  [-45, -19], [-28, -38], [-4, -46], [22, -41], [42, -25], [49, -2], [42, 23],
  [22, 42], [-4, 47], [-29, 38], [-46, 18], [-50, 0],
];

describe("radiusAtAngle", () => {
  it("intersects the square at the corner on the 45° ray", () => {
    expect(radiusAtAngle(square, Math.PI / 4)).toBeCloseTo(65.0538, 3);
  });

  it("reads the flat side on the axis rays", () => {
    expect(radiusAtAngle(square, 0)).toBeCloseTo(46, 9);
    expect(radiusAtAngle(square, Math.PI / 2)).toBeCloseTo(46, 9);
  });

  it("scales with the shape, not with a hard-coded radius", () => {
    const small = square.map(([x, y]) => [x / 2, y / 2] as const);
    expect(radiusAtAngle(small, Math.PI / 4)).toBeCloseTo(
      radiusAtAngle(square, Math.PI / 4) / 2,
      9,
    );
  });

  it("returns zero on a degenerate outline instead of NaN", () => {
    expect(radiusAtAngle([], 0)).toBe(0);
    expect(radiusAtAngle([], Math.PI / 3)).toBe(0);
  });
});

describe("deriveFace", () => {
  it("sizes the eyes from the room in the frontal cone", () => {
    const face = deriveFace(square);
    expect(face.rMin).toBeCloseTo(46, 6);
    expect(face.halfHeight).toBe(12);
    expect(face.halfWidth).toBeCloseTo(12 * 0.44, 9);
    expect(face.dy).toBeCloseTo(-0.14 * 46, 9);
  });

  it("ranks the shapes by how much frontal room they leave", () => {
    const cloudFace = deriveFace(cloud);
    const squircleFace = deriveFace(squircle);
    const starFace = deriveFace(star);
    expect(cloudFace.halfHeight).toBeGreaterThan(squircleFace.halfHeight);
    expect(squircleFace.halfHeight).toBeGreaterThan(starFace.halfHeight);
  });

  it("keeps the star's eyes narrow", () => {
    // The star's rMin is small enough that 0.30·rMin lands on the 5-unit floor.
    expect(deriveFace(star).halfWidth).toBeLessThan(4);
  });

  it("is deterministic", () => {
    for (const outline of [square, squircle, star, cloud]) {
      expect(deriveFace(outline)).toEqual(deriveFace(outline));
    }
  });

  it("applies the documented bounds and split rule", () => {
    for (const outline of [square, squircle, star, cloud, narrow]) {
      const face = deriveFace(outline);
      expect(face.halfHeight).toBeGreaterThanOrEqual(5);
      expect(face.halfHeight).toBeLessThanOrEqual(12);
      expect(face.halfWidth).toBeCloseTo(face.halfHeight * 0.44, 9);
      // The aesthetic spread, capped by the room the narrowest cheek leaves for the
      // pair plus its widths and the 2-unit margin.
      const spread = Math.max(
        4,
        (Math.asin(Math.min(0.9, (2.4 * face.halfWidth) / face.rMin)) * 180) / Math.PI,
      );
      const room =
        (Math.asin(Math.max(0, Math.min(0.85, (face.rMin - face.halfWidth - 2) / 44))) * 180) /
        Math.PI;
      expect(face.splitDeg).toBeCloseTo(Math.max(4, Math.min(spread, room)), 9);
      expect(face.dy).toBeCloseTo(-0.14 * face.rMin, 9);
    }
  });

  it("keeps the cloud's split under 20° and inside the room", () => {
    const face = deriveFace(cloud);
    expect(face.splitDeg).toBeLessThan(20);
    expect(face.splitDeg).toBeGreaterThan(4);
    // The room is an upper bound, not a target: the cloud's aesthetic spread already
    // sits inside it, so the cap does not widen the face.
    const roomSin = Math.min(0.85, (face.rMin - face.halfWidth - 2) / 44);
    const roomDeg = (Math.asin(roomSin) * 180) / Math.PI;
    expect(face.splitDeg).toBeLessThanOrEqual(roomDeg + 1e-9);
  });

  it("tightens a narrow face to the room instead of the aesthetic spread", () => {
    const face = deriveFace(narrow);
    const spread = (Math.asin(Math.min(0.9, (2.4 * face.halfWidth) / face.rMin)) * 180) / Math.PI;
    const room =
      (Math.asin(Math.min(0.85, (face.rMin - face.halfWidth - 2) / 44)) * 180) / Math.PI;
    expect(room).toBeLessThan(spread);
    expect(face.splitDeg).toBeCloseTo(room, 9);
  });

  it("uses the sphere radius in the room bound", () => {
    const at44 = deriveFace(narrow, { sphereRadius: 44 });
    const at22 = deriveFace(narrow, { sphereRadius: 22 });
    // A smaller sphere reaches the same chord at a larger angle.
    expect(at22.splitDeg).toBeGreaterThan(at44.splitDeg);
  });

  it("honours the style ratios and the width aspect", () => {
    const wide = deriveFace(square, { eyeHeightRatio: 0.2, eyeAspect: 2, centreOffsetRatio: 0.1 });
    expect(wide.halfHeight).toBeCloseTo(0.2 * 46, 9);
    expect(wide.halfWidth).toBeCloseTo(wide.halfHeight / 2, 9);
    expect(wide.dy).toBeCloseTo(4.6, 9);
  });
});
