import type { EyeGeometry, SphereEyeRig, StylePack } from "@botavatar/engine";
import { motion, palette, shapes } from "@botavatar/pack-organic-blob";

/**
 * A sphere pack for the gallery: organic-blob's bodies, colours, clips and durations,
 * but the eyes are capsules on a sphere instead of v1 rects. It is the one pack that
 * cannot go through `buildAvatarSpec` (a sphere rig has no v1 `rotation`), so it is
 * also the proof that the gallery really renders geometry.
 *
 * The separation is entirely `lateralDeg` (R57, no `splitDeg`): as the gaze turns,
 * the projection widens the near capsule and foreshortens the far one.
 */
export const orbEyes: SphereEyeRig = {
  kind: "sphere",
  sphereRadius: 44,
  // Placeholders: `buildGeometry` overrides `lateralDeg`, `halfWidth`, `halfHeight`
  // and `tiltDeg` with values derived from the body outline (`deriveFace`), plus
  // `restTiltDeg` below. Only `verticalDeg` is authored here.
  eyes: [
    { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
    { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
  ],
  fadeFromDepth: 0.12,
  cullAtDepth: 0.02,
  // 0.35 is enough for the slider to read as a head turn at ±45 (≈16° of body),
  // while the eyes still carry most of the gaze and keep their capsule shape.
  bodyCoupling: 0.35,
  // Symmetric to the coupling: the head nods with 35% of the pitch, the eyes take
  // the rest, so the vertical gaze reads as one object moving.
  bodyPitchFollow: 0.35,
  // Parallel rest tilt, both eyes the same way; mirrored tilt is reserved for expressions.
  restTiltDeg: -4,
};

export const orb: StylePack = {
  id: "orb",
  name: "Sphere Orb",
  version: "0.1.0",
  viewBox: "-60 -60 120 120",
  shapes,
  palette,
  // A sphere rig is not a v1 `EyeGeometry`, and the pack field is still typed as one
  // (R56). `buildGeometry` reads `kind` through the same cast at runtime.
  eyes: orbEyes as unknown as EyeGeometry,
  motion,
  assignment: "hash-only",
  // No `surface`: `renderGeometry` refuses surface material on a sphere rig rather
  // than painting the body flat, so the pack must not declare any.
};

/** The registry discovers packs through the glob's default export. */
export default orb;
