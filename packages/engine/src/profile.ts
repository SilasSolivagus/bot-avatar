/**
 * Shape profiles: `radii[PROFILE_SAMPLES]` generated from parameters.
 *
 * Evidence: `docs/design/2026-10-28-shape-profiles.md`. The reference implementation
 * (`bloub`'s `src/bot/skins.ts` / `src/bot/shape.ts`) stores every silhouette as 64
 * radial samples on a fixed angle wheel; generators only ever fill those 64 slots, so
 * any two shapes correspond sample-by-sample and interpolation is a plain lerp.
 *
 * Every generator is a pure function of its arguments: no clock, no I/O, no randomness.
 */

import type { Point } from "./geometry.js";
import { closedCurvePath } from "./outline.js";

/** Radial samples per silhouette, shared by every shape. */
export const PROFILE_SAMPLES = 64;

const TWO_PI = Math.PI * 2;
const ANGLE_STEP = TWO_PI / PROFILE_SAMPLES;

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface HarmonicTerm {
  amplitude: number;
  frequency: number;
  phase: number;
}

/** Fills the fixed 64-slot angle wheel: sample `i` is taken at `i/64 · 2π`. */
function sampleProfile(radiusAt: (angle: number) => number): number[] {
  return Array.from({ length: PROFILE_SAMPLES }, (_, index) => radiusAt(index * ANGLE_STEP));
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number, got ${String(value)}`);
  }
}

function assertCircle(circle: Circle, index: number): void {
  if (!Number.isFinite(circle.x) || !Number.isFinite(circle.y)) {
    throw new RangeError(`circles[${index}] must have finite x and y`);
  }
  assertPositive(circle.r, `circles[${index}].r`);
}

/**
 * Superellipse `|x/sx|^n + |y/sy|^n = 1` as a radial profile.
 *
 * Distance along the ray at `angle` is `(|cos/sx|^n + |sin/sy|^n)^(-1/n)`. Exponent 2
 * is a circle (when `sx = sy = 1`); exponent 4 is the reference's "squircle", whose
 * maximum lies on the diagonal (`2^(1/4)`) rather than on an axis — the reason the
 * squircle is normalized to a larger target than the circle.
 *
 * Parameter values are ours, per docs/design §6; the formula is the reference's.
 */
export function superellipseProfile(n: number, sx = 1, sy = 1): number[] {
  assertPositive(n, "superellipseProfile n");
  assertPositive(sx, "superellipseProfile sx");
  assertPositive(sy, "superellipseProfile sy");
  const inverse = -1 / n;
  return sampleProfile((angle) => {
    const x = Math.abs(Math.cos(angle) / sx);
    const y = Math.abs(Math.sin(angle) / sy);
    return (x ** n + y ** n) ** inverse;
  });
}

/** Unit vector with the direction of `angle`, or `null` for a zero vector. */
function unitAt(x: number, y: number): { x: number; y: number } | null {
  const length = Math.hypot(x, y);
  if (!(length > 0)) return null;
  return { x: x / length, y: y / length };
}

/**
 * Is `direction` inside the counter-clockwise arc from `from` to `to`?
 *
 * Used to reject circle hits that fall on the hidden part of a corner disc: the disc
 * is part of the shape, but only its outward arc is boundary.
 */
function inCcwArc(
  direction: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const cross = from.x * direction.y - from.y * direction.x;
  const dot = from.x * direction.x + from.y * direction.y;
  let delta = Math.atan2(cross, dot);
  if (delta < 0) delta += TWO_PI;
  const span = Math.atan2(from.x * to.y - from.y * to.x, from.x * to.x + from.y * to.y);
  return delta <= span + 1e-9;
}

/**
 * A regular `sides`-gon whose vertices sit at `radius − cornerRadius`, dilated by a
 * disc of `cornerRadius`: a true Minkowski round, i.e. exactly one circular arc per
 * corner, not a smoothing pass over a polygon.
 *
 * Boundary pieces alternate: an outward-offset edge (flat) and a vertex arc (round).
 * For each ray we intersect the offset edge *segment* and each vertex *disc*, keep only
 * the hits that lie on a real boundary piece, and take the farthest. Taking the
 * farthest is safe because every vertex disc is contained in the Minkowski sum, so a
 * hidden arc point can never be beyond the boundary.
 */
export function regularPolygonProfile(
  sides: number,
  radius: number,
  cornerRadius: number,
  rotationDeg = 0,
): number[] {
  if (!Number.isInteger(sides) || sides < 3) {
    throw new RangeError(`regularPolygonProfile sides must be an integer >= 3, got ${sides}`);
  }
  assertPositive(radius, "regularPolygonProfile radius");
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0) {
    throw new RangeError(
      `regularPolygonProfile cornerRadius must be a non-negative finite number, got ${cornerRadius}`,
    );
  }
  if (cornerRadius > radius) {
    throw new RangeError(
      `regularPolygonProfile cornerRadius (${cornerRadius}) must not exceed radius (${radius})`,
    );
  }
  if (!Number.isFinite(rotationDeg)) {
    throw new RangeError("regularPolygonProfile rotationDeg must be finite");
  }

  const inner = radius - cornerRadius;
  // Vertices at radius − rc, so the rounded corner's outermost point is `radius`.
  if (inner === 0) return sampleProfile(() => cornerRadius);

  const rotation = (rotationDeg * Math.PI) / 180;
  const step = TWO_PI / sides;
  const vertices: ReadonlyArray<readonly [number, number]> = Array.from(
    { length: sides },
    (_, index) => {
      const angle = rotation + index * step;
      return [inner * Math.cos(angle), inner * Math.sin(angle)] as const;
    },
  );
  // Outward normals of the flat edges, ordered counter-clockwise like the vertices.
  const edgeNormals = vertices.map((vertex, index) => {
    const next = vertices[(index + 1) % sides]!;
    const normal = unitAt(vertex[0] + next[0], vertex[1] + next[1]);
    // A regular polygon's edge midpoint direction is its outward normal.
    return normal ?? { x: 0, y: 0 };
  });
  const apothem = inner * Math.cos(Math.PI / sides);
  const offset = apothem + cornerRadius;
  const tolerance = 1e-9;
  let fallback = offset;
  if (!Number.isFinite(fallback) || fallback <= 0) fallback = radius;

  return sampleProfile((angle) => {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let farthest = -Infinity;

    // Flat pieces: the edge line offset outward by `cornerRadius`.
    for (let index = 0; index < sides; index++) {
      const normal = edgeNormals[index]!;
      const facing = normal.x * ux + normal.y * uy;
      if (facing <= tolerance) continue;
      const distance = offset / facing;
      if (!(distance > 0)) continue;
      const px = distance * ux;
      const py = distance * uy;
      const start = vertices[index]!;
      const end = vertices[(index + 1) % sides]!;
      const ex = end[0] - start[0];
      const ey = end[1] - start[1];
      const along = ((px - start[0]) * ex + (py - start[1]) * ey) / (ex * ex + ey * ey);
      // The offset segment spans the same parameter interval as the edge.
      if (along < -tolerance || along > 1 + tolerance) continue;
      if (distance > farthest) farthest = distance;
    }

    // Round pieces: the far intersection with each vertex disc, when it lands on the
    // outward arc between the two adjacent edge normals.
    if (cornerRadius > 0) {
      for (let index = 0; index < sides; index++) {
        const vertex = vertices[index]!;
        const along = vertex[0] * ux + vertex[1] * uy;
        const perpendicularSquared =
          vertex[0] * vertex[0] + vertex[1] * vertex[1] - along * along;
        const discriminant = cornerRadius * cornerRadius - perpendicularSquared;
        if (discriminant < -tolerance) continue;
        const distance = along + Math.sqrt(Math.max(0, discriminant));
        if (!(distance > 0)) continue;
        const hit = unitAt(distance * ux - vertex[0], distance * uy - vertex[1]);
        if (hit === null) continue;
        const previousNormal = edgeNormals[(index - 1 + sides) % sides]!;
        const nextNormal = edgeNormals[index]!;
        if (!inCcwArc(hit, previousNormal, nextNormal)) continue;
        if (distance > farthest) farthest = distance;
      }
    }

    return Number.isFinite(farthest) && farthest > 0 ? farthest : fallback;
  });
}

/**
 * Radial profile of the union of discs: along each ray, the farthest ray/circle
 * intersection. A ray that misses every disc reports 0.
 */
export function unionOfCirclesProfile(circles: ReadonlyArray<Circle>): number[] {
  if (circles.length === 0) {
    throw new RangeError("unionOfCirclesProfile needs at least one circle");
  }
  circles.forEach(assertCircle);

  return sampleProfile((angle) => {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let farthest = 0;
    for (const circle of circles) {
      const along = circle.x * ux + circle.y * uy;
      const perpendicularSquared =
        circle.x * circle.x + circle.y * circle.y - along * along;
      const discriminant = circle.r * circle.r - perpendicularSquared;
      if (discriminant < 0) continue;
      // The far root: the disc's exit point along the ray.
      const distance = along + Math.sqrt(discriminant);
      if (distance > farthest) farthest = distance;
    }
    return farthest;
  });
}

/**
 * Convex hull of two discs: the stadium-like shape bounded by the two outward arcs and
 * the two outer common tangents.
 *
 * Tangent normals satisfy `n · (b − a) = rb − ra`; for each ray we intersect the two
 * tangent *segments* and the two *discs*, keep only hits on real boundary pieces (a
 * disc hit is boundary only where that disc is the far support), and take the farthest.
 * One disc containing the other collapses the hull to the larger disc.
 */
export function hullOfCirclesProfile(a: Circle, b: Circle): number[] {
  assertCircle(a, 0);
  assertCircle(b, 1);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  // Internal tangency or containment: the hull is just the larger disc.
  if (Math.abs(b.r - a.r) >= distance) {
    return unionOfCirclesProfile([b.r >= a.r ? b : a]);
  }
  if (distance === 0) return unionOfCirclesProfile([b.r >= a.r ? b : a]);

  const ex = dx / distance;
  const ey = dy / distance;
  // A tangent line touches both discs: n·(b − a) = ra − rb, so the component of the
  // outward normal along `e = (b − a)/D` is `delta`.
  const delta = (a.r - b.r) / distance;
  const perpendicular = Math.sqrt(Math.max(0, 1 - delta * delta));
  // Two external tangent normals: delta·e ± perpendicular·perp(e).
  const normals = [
    { x: delta * ex - perpendicular * ey, y: delta * ey + perpendicular * ex },
    { x: delta * ex + perpendicular * ey, y: delta * ey - perpendicular * ex },
  ] as const;
  const segments = normals.map((normal) => ({
    normal,
    start: [a.x + a.r * normal.x, a.y + a.r * normal.y] as const,
    end: [b.x + b.r * normal.x, b.y + b.r * normal.y] as const,
    offset: normal.x * a.x + normal.y * a.y + a.r,
  }));
  const tolerance = 1e-9;
  let fallback = Math.max(a.r, b.r);
  if (!Number.isFinite(fallback) || fallback <= 0) fallback = 1;

  return sampleProfile((angle) => {
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let farthest = -Infinity;

    // Disc arcs. On `a`'s arc the ray's outward normal has e·h < delta; on `b`'s arc,
    // e·h > delta.
    for (const [circle, isFirst] of [
      [a, true],
      [b, false],
    ] as ReadonlyArray<readonly [Circle, boolean]>) {
      const along = circle.x * ux + circle.y * uy;
      const perpendicularSquared =
        circle.x * circle.x + circle.y * circle.y - along * along;
      const discriminant = circle.r * circle.r - perpendicularSquared;
      if (discriminant < -tolerance) continue;
      const hitDistance = along + Math.sqrt(Math.max(0, discriminant));
      if (!(hitDistance > 0)) continue;
      const hx = (hitDistance * ux - circle.x) / circle.r;
      const hy = (hitDistance * uy - circle.y) / circle.r;
      const side = ex * hx + ey * hy;
      // Arc A is boundary only where disc A out-supports disc B, and vice versa; the
      // two arcs meet where both supports tie, at e·n = delta.
      const onArc = isFirst ? side < delta - tolerance : side > delta + tolerance;
      if (!onArc) continue;
      if (hitDistance > farthest) farthest = hitDistance;
    }

    // Tangent segments.
    for (const segment of segments) {
      const facing = segment.normal.x * ux + segment.normal.y * uy;
      if (facing <= tolerance) continue;
      const hitDistance = segment.offset / facing;
      if (!(hitDistance > 0)) continue;
      const px = hitDistance * ux;
      const py = hitDistance * uy;
      const sx = segment.end[0] - segment.start[0];
      const sy = segment.end[1] - segment.start[1];
      const along =
        ((px - segment.start[0]) * sx + (py - segment.start[1]) * sy) / (sx * sx + sy * sy);
      if (along < -tolerance || along > 1 + tolerance) continue;
      if (hitDistance > farthest) farthest = hitDistance;
    }

    return Number.isFinite(farthest) && farthest > 0 ? farthest : fallback;
  });
}

/**
 * Low-frequency harmonics added to a base radius:
 * `base + Σ amplitude · cos(frequency · angle + phase)`.
 *
 * The reference's pebble is only 7.5% + 3.5% of two low harmonics: "organic" comes from
 * a very small perturbation, not a large deformation (docs/design §2).
 */
export function harmonicProfile(terms: ReadonlyArray<HarmonicTerm>, base = 1): number[] {
  if (!Number.isFinite(base)) {
    throw new RangeError(`harmonicProfile base must be finite, got ${String(base)}`);
  }
  terms.forEach((term, index) => {
    if (
      !Number.isFinite(term.amplitude) ||
      !Number.isFinite(term.frequency) ||
      !Number.isFinite(term.phase)
    ) {
      throw new RangeError(`harmonicProfile terms[${index}] must be finite`);
    }
  });

  return sampleProfile(
    (angle) =>
      base +
      terms.reduce(
        (sum, term) => sum + term.amplitude * Math.cos(term.frequency * angle + term.phase),
        0,
      ),
  );
}

/**
 * Scales a profile so its largest radius equals `max`.
 *
 * The reference normalizes every shape to the same visual weight, with per-shape targets
 * (squircle 1.15 because its maximum is on the diagonal, cloud/pebble 1.02, droplet 1.04,
 * circle 1). The target is the caller's choice; this function only scales, so ratios
 * between samples are preserved exactly.
 */
export function normalizeRadii(radii: readonly number[], max = 1): number[] {
  if (!Number.isFinite(max)) {
    throw new RangeError(`normalizeRadii max must be finite, got ${String(max)}`);
  }
  if (radii.length === 0) return [];
  let peak = -Infinity;
  for (const [index, radius] of radii.entries()) {
    if (!Number.isFinite(radius)) {
      throw new RangeError(`normalizeRadii[${index}] must be finite, got ${String(radius)}`);
    }
    if (radius > peak) peak = radius;
  }
  if (!Number.isFinite(peak) || peak <= 0) {
    throw new RangeError("normalizeRadii needs a profile with a positive finite maximum");
  }
  const factor = max / peak;
  return radii.map((radius) => radius * factor);
}

/**
 * Turns a profile into 64 points on the same angle wheel: sample `i` sits at
 * `i / PROFILE_SAMPLES · 2π` at distance `radii[i]`.
 */
export function radiiToPoints(radii: readonly number[]): Array<[number, number]> {
  const step = radii.length === 0 ? 0 : TWO_PI / radii.length;
  return radii.map((radius, index) => {
    const angle = index * step;
    return [radius * Math.cos(angle), radius * Math.sin(angle)] as [number, number];
  });
}

/**
 * Validates a shape's radial profile: exactly {@link PROFILE_SAMPLES} samples, every one
 * a positive finite number, and a finite sum.
 *
 * The shape model says exactly one of `outline` / `radii` is present on a family, and
 * `parsePack` will enforce that at startup. This check is the inner contract every
 * consumer of `radii` can rely on: a malformed profile fails where it is used rather
 * than turning into a NaN path.
 */
export function assertRadii(radii: readonly number[], label = "radii"): void {
  if (radii.length !== PROFILE_SAMPLES) {
    throw new RangeError(`${label} must have ${PROFILE_SAMPLES} samples, got ${radii.length}`);
  }
  let sum = 0;
  for (let index = 0; index < radii.length; index++) {
    const radius = radii[index]!;
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(
        `${label}[${index}] must be a positive finite number, got ${String(radius)}`,
      );
    }
    sum += radius;
  }
  if (!Number.isFinite(sum)) {
    throw new RangeError(`${label} must have a finite sum`);
  }
}

/** Is this shape representation a radial profile rather than a polygon? */
export function isRadiiProfile(
  shape: ReadonlyArray<Point> | readonly number[],
): shape is readonly number[] {
  return shape.length > 0 && typeof shape[0] === "number";
}

/**
 * The radius at `angleRad`, interpolated between the two adjacent samples.
 *
 * O(1): one index computation and one lerp, no ray casting. Angles wrap, so a negative
 * angle or one beyond a full turn reads the same profile; on a sample angle the stored
 * sample is returned unchanged.
 */
export function radiusAtRadii(radii: readonly number[], angleRad: number): number {
  assertRadii(radii, "radii");
  if (!Number.isFinite(angleRad)) {
    throw new RangeError(`radiusAtRadii angle must be finite, got ${String(angleRad)}`);
  }
  const count = radii.length;
  const position = ((angleRad / TWO_PI) * count) % count;
  const wrapped = position < 0 ? position + count : position;
  const index = Math.floor(wrapped);
  const fraction = wrapped - index;
  const current = radii[index]!;
  if (fraction === 0) return current;
  return current + (radii[(index + 1) % count]! - current) * fraction;
}

/**
 * The SVG path for a radial profile: the same closed Catmull-Rom construction the
 * polygon path uses, fed the 64 sample points directly.
 *
 * No Chaikin smoothing and no per-identity affine distortion: the samples are already
 * the shape (`docs/design` §1), and a profile's variation is its own, not the v1 phase
 * distortion.
 */
export function radiiToPath(radii: readonly number[]): string {
  assertRadii(radii, "radiiToPath");
  return closedCurvePath(radiiToPoints(radii).map(([x, y]) => ({ x, y })));
}
