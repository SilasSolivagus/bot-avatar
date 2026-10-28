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
  // Eye 0 sits at lateral +18, eye 1 at -18, so the two are mirror images at rest.
  eyes: [
    { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: -6 },
    { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 6 },
  ],
  fadeFromDepth: 0.12,
  cullAtDepth: 0.02,
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
