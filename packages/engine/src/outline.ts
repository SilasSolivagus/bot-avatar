type Point = readonly [number, number];

/** Upstream spreads the seed over one turn to distort each body slightly. */
export function phaseForSeed(seed: number): number {
  return ((seed % 360) * Math.PI) / 180;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A closed Catmull-Rom curve through `points`, as SVG cubics, at the upstream tension
 * of 1/6. Every emitted number is rounded to two decimals.
 *
 * This is the curve construction both body representations share: `outlinePath` feeds
 * it the smoothed polygon, `radiiToPath` feeds it the 64 profile points directly.
 */
export function closedCurvePath(points: ReadonlyArray<{ x: number; y: number }>): string {
  const count = points.length;
  if (count === 0) throw new RangeError("closedCurvePath needs at least one point");
  const first = points[0]!;
  let path = `M${round(first.x)} ${round(first.y)}`;
  for (let index = 0; index < count; index++) {
    const before = points[(index - 1 + count) % count]!;
    const current = points[index]!;
    const next = points[(index + 1) % count]!;
    const after = points[(index + 2) % count]!;
    path +=
      `C${round(current.x + (next.x - before.x) / 6)} ${round(current.y + (next.y - before.y) / 6)}` +
      ` ${round(next.x - (after.x - current.x) / 6)} ${round(next.y - (after.y - current.y) / 6)}` +
      ` ${round(next.x)} ${round(next.y)}`;
  }
  return `${path}Z`;
}

/**
 * Turns a polygon into an SVG path: affine distortion from the phase, then
 * Chaikin smoothing, then Catmull-Rom control points.
 *
 * Bit-exact with the upstream implementation: every emitted number is rounded,
 * and the smoothing runs before the curve, not after.
 */
export function outlinePath(
  outline: ReadonlyArray<Point>,
  { phase, smoothingPasses = 2 }: { phase: number; smoothingPasses?: number },
): string {
  const xScale = 1 + Math.sin(phase) * 0.035;
  const yScale = 1 + Math.cos(phase) * 0.025;
  const shear = Math.sin(phase * 1.7) * 0.025;

  let points = outline.map(([x, y]) => ({ x: x * xScale + y * shear, y: y * yScale }));

  for (let pass = 0; pass < smoothingPasses; pass++) {
    points = points.flatMap((point, index) => {
      const next = points[(index + 1) % points.length]!;
      return [
        { x: point.x * 0.75 + next.x * 0.25, y: point.y * 0.75 + next.y * 0.25 },
        { x: point.x * 0.25 + next.x * 0.75, y: point.y * 0.25 + next.y * 0.75 },
      ];
    });
  }

  return closedCurvePath(points);
}
