import type { StylePack, AvatarSpec } from "./spec.js";
import type { AvatarGeometry } from "./geometry.js";
import { phaseForSeed } from "./outline.js";

/** 把 v1 的 spec 如实描述成几何：不发明新语义，只换一种表达。 */
export function toGeometry(pack: StylePack, spec: AvatarSpec): AvatarGeometry {
  const shape = pack.shapes[spec.family]!;
  return {
    packId: spec.packId,
    packVersion: spec.packVersion,
    identity: spec.identity,
    seed: spec.seed,
    family: spec.family,
    look: spec.look,
    body: {
      outline: shape.outline,
      phase: phaseForSeed(spec.seed),
      smoothingPasses: shape.smoothingPasses ?? 2,
      curve: "smooth",
      viewBox: spec.viewBox,
    },
    rig: {
      kind: "rect",
      eyes: spec.eyes,
      rotationDeg: spec.eyeRotation,
    },
    pose: { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 },
    ink: {
      body: spec.color.light,
      bodyHighlight: spec.color.dark,
      eyes: spec.color.eye,
      bodyId: spec.color.id,
      bodyName: spec.color.name,
    },
    durationMs: spec.durationMs,
    motionAmplitude: spec.motionAmplitude,
    clip: spec.clip,
  };
}
