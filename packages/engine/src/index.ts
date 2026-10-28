export type {
  AvatarSpec,
  EyeGeometry,
  PaletteColor,
  ShapeFamily,
  StylePack,
  Surface,
} from "./spec.js";
export type {
  AvatarGeometry,
  Body,
  EyeRig,
  Ink,
  Point,
  Pose,
  RectEyeRig,
  SphereEyeRig,
} from "./geometry.js";
export type { ProjectedEye } from "./eye-projection.js";
export { projectEye } from "./eye-projection.js";
export type { Face, FaceStyle, ShapeSamples } from "./face.js";
export { deriveFace, radiusAtAngle } from "./face.js";
export { avatarSeed } from "./seed.js";
export { avatarAssignableLooks, avatarFamily, avatarLook } from "./family.js";
export { closedCurvePath, outlinePath, phaseForSeed } from "./outline.js";
export { colorIndex, fnv1a } from "./color.js";
export {
  PROFILE_SAMPLES,
  assertRadii,
  harmonicProfile,
  hullOfCirclesProfile,
  isRadiiProfile,
  normalizeRadii,
  radiiToPath,
  radiiToPoints,
  radiusAtRadii,
  regularPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile,
} from "./profile.js";
export type { Circle, HarmonicTerm } from "./profile.js";
export { buildAvatarSpec, radiiShape } from "./spec.js";
export { buildGeometry } from "./build-geometry.js";
export { toGeometry } from "./geometry-from-spec.js";
export { CLIP_NAMES, clipFrame } from "./clips.js";
export type { ClipFrame, ClipName } from "./clips.js";
export type { Random } from "./assignment.js";
export { avatarSampleIdentity, pickLeastUsed } from "./assignment.js";
