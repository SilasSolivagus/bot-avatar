import { describe, expect, it } from "vitest";
import {
  PROFILE_SAMPLES,
  harmonicProfile,
  hullOfCirclesProfile,
  normalizeRadii,
  radiiToPoints,
  regularPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile,
} from "../src/profile.js";

const TWO_PI = Math.PI * 2;
const SAMPLE_ANGLE = TWO_PI / PROFILE_SAMPLES;

/** The angle sample `index` is taken at, in radians. */
const angleAt = (index: number): number => index * SAMPLE_ANGLE;

/**
 * Local maxima of a radial profile, counting a run of equal samples as one peak.
 * The scan starts at the smallest sample so a plateau that wraps through index 0 is
 * still one peak instead of two half-plateaus.
 */
function peakCount(radii: readonly number[], epsilon = 1e-9): number {
  let start = 0;
  for (let index = 1; index < radii.length; index++) {
    if (radii[index]! < radii[start]!) start = index;
  }
  const rotated = [...radii.slice(start), ...radii.slice(0, start)];
  const count = rotated.length;
  let peaks = 0;
  let index = 0;
  while (index < count) {
    let end = index;
    while (end + 1 < count && Math.abs(rotated[end + 1]! - rotated[index]!) <= epsilon) end++;
    const previous = rotated[(index - 1 + count) % count]!;
    const next = rotated[(end + 1) % count]!;
    if (rotated[index]! > previous + epsilon && rotated[index]! > next + epsilon) peaks++;
    index = end + 1;
  }
  return peaks;
}

/** max / min, the visual "peakiness" of a profile. */
function peakToTrough(radii: readonly number[]): number {
  return Math.max(...radii) / Math.min(...radii);
}

describe("PROFILE_SAMPLES", () => {
  it("is the reference's fixed 64-sample angle wheel", () => {
    expect(PROFILE_SAMPLES).toBe(64);
  });
});

describe("superellipseProfile", () => {
  it("gives a circle at exponent 2", () => {
    const circle = superellipseProfile(2);
    expect(circle).toHaveLength(PROFILE_SAMPLES);
    for (const radius of circle) expect(radius).toBeCloseTo(1, 12);
    expect(peakCount(circle)).toBe(0);
  });

  it("scales the circle by sx and sy", () => {
    const ellipse = superellipseProfile(2, 2, 2);
    for (const radius of ellipse) expect(radius).toBeCloseTo(2, 12);
    expect(superellipseProfile(2, 2, 1)[0]).toBeCloseTo(2, 12);
    expect(superellipseProfile(2, 2, 1)[16]).toBeCloseTo(1, 12);
  });

  it("puts the exponent-4 squircle's maximum on the diagonal", () => {
    const squircle = superellipseProfile(4);
    const axial = squircle[0]!;
    const diagonal = squircle[8]!; // 8 × 5.625° = 45°
    expect(diagonal).toBeGreaterThan(axial);
    expect(axial).toBeCloseTo(1, 12);
    expect(diagonal).toBeCloseTo(2 ** 0.25, 12);
  });

  it("sharpens towards a square as the exponent grows", () => {
    const e4 = peakToTrough(superellipseProfile(4));
    const e8 = peakToTrough(superellipseProfile(8));
    expect(e8).toBeGreaterThan(e4);
  });

  it("rejects a non-positive exponent", () => {
    expect(() => superellipseProfile(0)).toThrow(RangeError);
    expect(() => superellipseProfile(-2)).toThrow(RangeError);
  });
});

describe("regularPolygonProfile", () => {
  it("shows six peaks for a rounded hexagon", () => {
    const hexagon = regularPolygonProfile(6, 1, 0.26);
    expect(hexagon).toHaveLength(PROFILE_SAMPLES);
    expect(peakCount(hexagon)).toBe(6);
    expect(Math.max(...hexagon)).toBeCloseTo(1, 12);
    // Sharp corners sit at radius − cornerRadius; the arc lifts them back to radius.
    expect(hexagon[0]).toBeCloseTo(1, 12);
  });

  it("shows one peak per side for other polygons", () => {
    expect(peakCount(regularPolygonProfile(3, 1, 0.2))).toBe(3);
    expect(peakCount(regularPolygonProfile(4, 1, 0.2))).toBe(4);
    expect(peakCount(regularPolygonProfile(8, 1, 0.2))).toBe(8);
  });

  it("rounds the corners with an arc, so the trough is the offset apothem", () => {
    const sides = 6;
    const radius = 1;
    const cornerRadius = 0.26;
    const hexagon = regularPolygonProfile(sides, radius, cornerRadius);
    const inner = radius - cornerRadius;
    const apothem = inner * Math.cos(Math.PI / sides);
    // The flat side's normal is 30°; the nearest sample is 28.125°, on that same flat
    // segment, so its radius is the offset apothem divided by the cosine of the tilt.
    const index = 5;
    const sampleDegrees = (index * 360) / PROFILE_SAMPLES;
    const expected = (apothem + cornerRadius) / Math.cos(((sampleDegrees - 30) * Math.PI) / 180);
    expect(hexagon[index]).toBeCloseTo(expected, 12);
  });

  it("lowers the peak/trough ratio as the corner radius grows", () => {
    const ratios = [0, 0.1, 0.26, 0.4].map((rc) =>
      peakToTrough(regularPolygonProfile(6, 1, rc)),
    );
    for (let index = 1; index < ratios.length; index++) {
      expect(ratios[index]!).toBeLessThan(ratios[index - 1]!);
    }
  });

  it("rotates the vertex wheel", () => {
    const upright = regularPolygonProfile(4, 1, 0.1);
    const tilted = regularPolygonProfile(4, 1, 0.1, 45);
    // A square with a vertex at 0° peaks there; the 45° turn makes the 45° ray a peak.
    expect(upright[0]!).toBeGreaterThan(upright[8]!);
    expect(tilted[8]!).toBeGreaterThan(tilted[0]!);
  });

  it("rejects degenerate parameters", () => {
    expect(() => regularPolygonProfile(2, 1, 0.1)).toThrow(RangeError);
    expect(() => regularPolygonProfile(6, 0, 0.1)).toThrow(RangeError);
    expect(() => regularPolygonProfile(6, 1, -0.1)).toThrow(RangeError);
    expect(() => regularPolygonProfile(6, 1, 1.5)).toThrow(RangeError);
  });
});

describe("unionOfCirclesProfile", () => {
  it("takes the farther circle on each ray", () => {
    const far = { x: 0.3, y: 0, r: 0.4 };
    const near = { x: -0.3, y: 0, r: 0.2 };
    const union = unionOfCirclesProfile([far, near]);
    expect(union[0]).toBeCloseTo(0.3 + 0.4, 12); // +x: the far-right circle
    expect(union[32]).toBeCloseTo(0.3 + 0.2, 12); // −x: the left circle's outer edge
  });

  it("reads a lone circle as its radial function", () => {
    const union = unionOfCirclesProfile([{ x: 0, y: 0, r: 0.5 }]);
    for (const radius of union) expect(radius).toBeCloseTo(0.5, 12);
  });

  it("is at least each circle's own profile", () => {
    const circles = [
      { x: 0, y: 0, r: 0.6 },
      { x: 0.4, y: 0, r: 0.3 },
      { x: -0.4, y: 0.2, r: 0.25 },
    ];
    const union = unionOfCirclesProfile(circles);
    for (const circle of circles) {
      const alone = unionOfCirclesProfile([circle]);
      for (let index = 0; index < PROFILE_SAMPLES; index++) {
        expect(union[index]!).toBeGreaterThanOrEqual(alone[index]! - 1e-12);
      }
    }
  });

  it("rejects an empty list", () => {
    expect(() => unionOfCirclesProfile([])).toThrow(RangeError);
  });
});

describe("hullOfCirclesProfile", () => {
  it("builds the stadium of two equal discs", () => {
    const a = { x: -0.5, y: 0, r: 0.3 };
    const b = { x: 0.5, y: 0, r: 0.3 };
    const hull = hullOfCirclesProfile(a, b);
    expect(hull[0]).toBeCloseTo(0.8, 12); // +x: b + its radius
    expect(hull[32]).toBeCloseTo(0.8, 12); // −x: a + its radius
    expect(hull[16]).toBeCloseTo(0.3, 12); // +y: the flat side of the stadium
    // 45° is on the upper tangent segment y = 0.3, at x = 0.3.
    expect(hull[8]).toBeCloseTo(0.3 / Math.sin(Math.PI / 4), 12);
  });

  it("contains both discs", () => {
    const a = { x: -0.4, y: 0, r: 0.3 };
    const b = { x: 0.5, y: 0.1, r: 0.2 };
    const hull = hullOfCirclesProfile(a, b);
    for (const circle of [a, b]) {
      const alone = unionOfCirclesProfile([circle]);
      for (let index = 0; index < PROFILE_SAMPLES; index++) {
        expect(hull[index]!).toBeGreaterThanOrEqual(alone[index]! - 1e-12);
      }
    }
  });

  it("radial profile has no dents: the hull is larger than the union of the discs", () => {
    const a = { x: -0.4, y: 0, r: 0.3 };
    const b = { x: 0.5, y: 0.1, r: 0.2 };
    const hull = hullOfCirclesProfile(a, b);
    const union = unionOfCirclesProfile([a, b]);
    for (let index = 0; index < PROFILE_SAMPLES; index++) {
      expect(hull[index]!).toBeGreaterThanOrEqual(union[index]! - 1e-12);
    }
  });

  it("collapses to the larger disc when one contains the other", () => {
    const hull = hullOfCirclesProfile({ x: 0, y: 0, r: 0.5 }, { x: 0.1, y: 0, r: 0.2 });
    const alone = unionOfCirclesProfile([{ x: 0, y: 0, r: 0.5 }]);
    expect(hull).toEqual(alone);
  });
});

describe("harmonicProfile", () => {
  it("sums the low harmonics on top of the base", () => {
    const terms = [
      { amplitude: 0.075, frequency: 2, phase: 0.5 },
      { amplitude: 0.035, frequency: 3, phase: 2.1 },
    ];
    const pebble = harmonicProfile(terms);
    for (let index = 0; index < PROFILE_SAMPLES; index++) {
      const angle = angleAt(index);
      const expected =
        1 + 0.075 * Math.cos(2 * angle + 0.5) + 0.035 * Math.cos(3 * angle + 2.1);
      expect(pebble[index]!).toBeCloseTo(expected, 12);
    }
    // The two harmonics cannot both reach −1 on the same sample angle, so the profile
    // stays strictly inside the ±0.11 envelope.
    expect(Math.max(...pebble)).toBeLessThanOrEqual(1.11 + 1e-12);
    expect(Math.min(...pebble)).toBeGreaterThan(1 - 0.11 - 1e-12);
  });

  it("defaults to a base of 1 and honours an explicit base", () => {
    expect(harmonicProfile([])).toEqual(new Array(PROFILE_SAMPLES).fill(1));
    expect(harmonicProfile([], 2)).toEqual(new Array(PROFILE_SAMPLES).fill(2));
  });
});

describe("normalizeRadii", () => {
  it("scales the largest radius to the target and preserves ratios", () => {
    const radii = [2, 1, 4, 3];
    const normalized = normalizeRadii(radii);
    expect(Math.max(...normalized)).toBeCloseTo(1, 12);
    expect(normalized).toEqual(radii.map((radius) => radius / 4));
  });

  it("accepts a custom target, the shape family's visual-weight compensation", () => {
    const normalized = normalizeRadii([2, 1, 4], 1.15);
    expect(normalized[2]).toBeCloseTo(1.15, 12);
    expect(normalized[0] / normalized[1]).toBeCloseTo(2, 12);
  });

  it("keeps the profile's shape, not just its maximum", () => {
    const radii = regularPolygonProfile(6, 1, 0.26);
    const normalized = normalizeRadii(radii, 46);
    for (let index = 0; index < PROFILE_SAMPLES; index++) {
      expect(normalized[index]! / normalized[0]!).toBeCloseTo(radii[index]! / radii[0]!, 12);
    }
  });

  it("returns an empty profile unchanged and rejects a non-positive maximum", () => {
    expect(normalizeRadii([])).toEqual([]);
    expect(() => normalizeRadii([0, 0])).toThrow(RangeError);
    expect(() => normalizeRadii([1, NaN])).toThrow(RangeError);
  });
});

describe("radiiToPoints", () => {
  it("places one point per sample on the sample angles", () => {
    const radii = new Array(PROFILE_SAMPLES).fill(10) as number[];
    const points = radiiToPoints(radii);
    expect(points).toHaveLength(PROFILE_SAMPLES);
    expect(points[0]![0]).toBeCloseTo(10, 12);
    expect(points[0]![1]).toBeCloseTo(0, 12);
    expect(points[16]![0]).toBeCloseTo(0, 12);
    expect(points[16]![1]).toBeCloseTo(10, 12);
    for (const [x, y] of points) expect(Math.hypot(x, y)).toBeCloseTo(10, 12);
  });

  it("spaces the points over one turn whatever the sample count", () => {
    const points = radiiToPoints([1, 2, 3, 4]);
    expect(points[1]![0]).toBeCloseTo(2 * Math.cos(Math.PI / 2), 12);
    expect(points[1]![1]).toBeCloseTo(2, 12);
    expect(points[2]![0]).toBeCloseTo(3 * Math.cos(Math.PI), 12);
  });
});

describe("determinism", () => {
  it("every generator is a pure function of its arguments", () => {
    const cases = [
      () => superellipseProfile(4, 1.2, 0.8),
      () => regularPolygonProfile(6, 1, 0.26, 15),
      () => unionOfCirclesProfile([{ x: 0.1, y: -0.2, r: 0.5 }]),
      () => hullOfCirclesProfile({ x: -0.3, y: 0, r: 0.4 }, { x: 0.4, y: 0.1, r: 0.25 }),
      () => harmonicProfile([{ amplitude: 0.075, frequency: 2, phase: 0.5 }]),
    ];
    for (const generate of cases) {
      const first = generate();
      expect(first).toEqual(generate());
      for (const radius of first) {
        expect(Number.isFinite(radius)).toBe(true);
        expect(radius).toBeGreaterThan(0);
      }
    }
  });
});
