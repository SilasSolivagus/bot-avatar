import type { AvatarGeometry, Pose } from "@botavatar/engine";

/** Straight gaze, eyes open: the pose every geometry starts in. */
export const REST_POSE: Pose = { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 };

/**
 * A slider is a pose, not a new avatar: the body, ink and rig stay the geometry
 * `buildGeometry` produced for this identity, and only `pose` is replaced. The
 * geometry is copied because the wall holds that same object, and `renderGeometry`
 * must never see a mutated one.
 */
export function poseGeometry(geometry: AvatarGeometry, pose: Pose): AvatarGeometry {
  return { ...geometry, pose: { gaze: { ...pose.gaze }, lidOpen: pose.lidOpen } };
}
