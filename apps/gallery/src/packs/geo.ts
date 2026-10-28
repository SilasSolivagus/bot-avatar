import type { EyeGeometry, Point, ShapeFamily, SphereEyeRig, StylePack } from "@botavatar/engine";
import { palette } from "@botavatar/pack-organic-blob";

/**
 * A second sphere species for the gallery: crisp geometry instead of organic-blob's
 * generated blobs, so the wall proves the face is derived from whatever outline it is
 * given. The eyes on both families come from `deriveFace`, not from this file.
 */

/** Superellipse radius at `angle`, exponent `n`: `|x|^n + |y|^n = halfExtent^n`. */
function superellipse(halfExtent: number, exponent: number, angle: number): Point {
  const power = 2 / exponent;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    Math.sign(cos) * halfExtent * Math.abs(cos) ** power,
    Math.sign(sin) * halfExtent * Math.abs(sin) ** power,
  ];
}

/** A squircle: exponent 4, 7.5° steps, so 48 points and no visible facet at any size. */
const SQUIRCLE_HALF_EXTENT = 46;
const SQUIRCLE_EXPONENT = 4;
const SQUIRCLE_STEP_DEG = 7.5;

function squircleOutline(): readonly Point[] {
  return Array.from({ length: Math.round(360 / SQUIRCLE_STEP_DEG) }, (_, index) => {
    const angle = (index * SQUIRCLE_STEP_DEG * Math.PI) / 180;
    return superellipse(SQUIRCLE_HALF_EXTENT, SQUIRCLE_EXPONENT, angle);
  });
}

/**
 * A stadium: straight sides plus semicircular caps. The caps are sampled every 7.5°
 * and the straight sides need no samples of their own — the two cap endpoints are
 * already the side's endpoints, and Chaikin keeps the segment straight.
 */
const CAPSULE_HALF_WIDTH = 34;
const CAPSULE_HALF_HEIGHT = 52;
const CAPSULE_STEP_DEG = 7.5;
/** Where the caps begin: the straight side runs from −18 to +18. */
const CAPSULE_STRAIGHT = CAPSULE_HALF_HEIGHT - CAPSULE_HALF_WIDTH;

function capsuleOutline(): readonly Point[] {
  const steps = Math.round(180 / CAPSULE_STEP_DEG);
  const points: Point[] = [];
  for (let index = 0; index <= steps; index++) {
    const angle = (index * CAPSULE_STEP_DEG * Math.PI) / 180;
    points.push([
      CAPSULE_HALF_WIDTH * Math.cos(angle),
      -CAPSULE_STRAIGHT - CAPSULE_HALF_WIDTH * Math.sin(angle),
    ]);
  }
  for (let index = 0; index <= steps; index++) {
    const angle = Math.PI + (index * CAPSULE_STEP_DEG * Math.PI) / 180;
    points.push([
      CAPSULE_HALF_WIDTH * Math.cos(angle),
      CAPSULE_STRAIGHT - CAPSULE_HALF_WIDTH * Math.sin(angle),
    ]);
  }
  return points;
}

export const geoShapes: readonly ShapeFamily[] = [
  { smoothingPasses: 1, outline: squircleOutline() },
  { smoothingPasses: 1, outline: capsuleOutline() },
];

/**
 * Sphere eyes with the gallery's standard optics. `lateralDeg`, `halfWidth`,
 * `halfHeight` and `tiltDeg` are placeholders: `buildGeometry` replaces every one of
 * them with the values `deriveFace` measures from the body outline (the rest tilt
 * comes from `restTiltDeg`). Only `verticalDeg` is authored here.
 */
export const geoEyes: SphereEyeRig = {
  kind: "sphere",
  sphereRadius: 44,
  eyes: [
    { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
    { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
  ],
  fadeFromDepth: 0.12,
  cullAtDepth: 0.02,
  // The same split as `orb`: the head takes just over a third of the turn and the
  // nod, the eyes carry the rest, so the two read as one object looking around.
  bodyCoupling: 0.35,
  bodyPitchFollow: 0.35,
  // Parallel, both eyes the same way: the resting face must never look cross-eyed.
  restTiltDeg: -4,
};

export const geo: StylePack = {
  id: "geo",
  name: "Geo",
  version: "0.1.0",
  viewBox: "-60 -60 120 120",
  shapes: geoShapes,
  palette,
  eyes: geoEyes as unknown as EyeGeometry,
  motion: {
    durationMsByFamily: [1700, 1900],
    amplitude: 1,
    clipByFamily: ["breathe", "sway"],
  },
  assignment: "hash-only",
  // No `surface`: `renderGeometry` refuses surface material on a sphere rig.
};

/** The registry discovers packs through the glob's default export. */
export default geo;
