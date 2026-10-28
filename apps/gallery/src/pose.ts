import type { AvatarGeometry, Pose } from "@botavatar/engine";

/** Straight gaze, eyes open: the pose every geometry starts in. */
export const REST_POSE: Pose = { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 };

/** The full turn at the edge of the follow area: the same range as the yaw slider. */
export const FOLLOW_YAW_MAX = 45;
/** The full nod at the edge: the pitch range is tighter, as a head nods less than it turns. */
export const FOLLOW_PITCH_MAX = 25;

/** The part of `DOMRect` the mapping reads; a plain object keeps this pure and testable. */
export interface PointerBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clampUnit = (value: number): number => Math.max(-1, Math.min(1, value));

/**
 * Pointer-follow gaze: the centre of the box is rest, its edges are the full turn.
 * Right is positive yaw, up is positive pitch. Clamped, so a pointer that leaves the
 * element between events still maps to the nearest edge instead of an unbounded angle.
 */
export function gazeFromPointer(x: number, y: number, bounds: PointerBounds): Pose["gaze"] {
  // A zero-sized box (display:none, or a collapsed panel) has no meaningful centre.
  const halfWidth = bounds.width / 2 || 1;
  const halfHeight = bounds.height / 2 || 1;
  const nx = clampUnit((x - (bounds.left + halfWidth)) / halfWidth);
  const ny = clampUnit((y - (bounds.top + halfHeight)) / halfHeight);
  // `|| 0` turns the negative zero of a just-left-of-centre pointer back into 0.
  return {
    yaw: Math.round(nx * FOLLOW_YAW_MAX) || 0,
    pitch: Math.round(-ny * FOLLOW_PITCH_MAX) || 0,
  };
}

/**
 * A slider is a pose, not a new avatar: the body, ink and rig stay the geometry
 * `buildGeometry` produced for this identity, and only `pose` is replaced. The
 * geometry is copied because the wall holds that same object, and `renderGeometry`
 * must never see a mutated one.
 */
export function poseGeometry(geometry: AvatarGeometry, pose: Pose): AvatarGeometry {
  return { ...geometry, pose: { gaze: { ...pose.gaze }, lidOpen: pose.lidOpen } };
}
