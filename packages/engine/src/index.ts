export type {
  AvatarSpec,
  EyeGeometry,
  PaletteColor,
  ShapeFamily,
  StylePack,
  Surface,
} from "./spec.js";
export { avatarSeed } from "./seed.js";
export { avatarAssignableLooks, avatarFamily, avatarLook } from "./family.js";
export { outlinePath, phaseForSeed } from "./outline.js";
export { colorIndex, fnv1a } from "./color.js";
export { buildAvatarSpec } from "./spec.js";
export { CLIP_NAMES, clipFrame } from "./clips.js";
export type { ClipFrame, ClipName } from "./clips.js";
export type { Random } from "./assignment.js";
export { avatarSampleIdentity, pickLeastUsed } from "./assignment.js";
