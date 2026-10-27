import { colorIndex } from "./color.js";
import type { ClipName } from "./clips.js";
import { avatarFamily, avatarLook } from "./family.js";
import { outlinePath, phaseForSeed } from "./outline.js";
import { avatarSeed } from "./seed.js";

export interface PaletteColor {
  id: string;
  name: string;
  light: string;
  dark: string;
  eye: string;
  /** Legacy stored value (`#8B5CF6`), used only by the compat layer. */
  hex?: string;
}

export interface ShapeFamily {
  /** 120x120 coordinate space, origin at the centre; a closed polygon. */
  outline: ReadonlyArray<readonly [number, number]>;
  /** Assignment never targets a reserved family; the hash may still land on it. */
  reserved?: boolean;
  /** Visually equivalent families share a look. Defaults to the family index. */
  look?: number;
  /** Smoothing rounds applied before the path is drawn. Defaults to 2. */
  smoothingPasses?: number;
}

export interface EyeGeometry {
  eyes: ReadonlyArray<
    | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
    | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  >;
  /** `seed % modulo - spread`. */
  rotation: { modulo: number; spread: number };
}

export interface Surface {
  /** Replaces the light/dark pair. Offsets are 0..1. */
  stops?: ReadonlyArray<{ offset: number; color: string }>;
  /** A soft specular blob, drawn over the body. */
  highlight?: { cx: number; cy: number; r: number; opacity: number };
  shadow?: { dx: number; dy: number; blur: number; color: string };
  texture?: { kind: "none" | "grain"; opacity: number };
}

export interface StylePack {
  id: string;
  name: string;
  version: string;
  viewBox: string;
  shapes: readonly ShapeFamily[];
  palette: readonly PaletteColor[];
  eyes: EyeGeometry;
  motion: {
    durationMsByFamily: readonly number[];
    amplitude: number;
    /** One clip per family, so neighbours on a wall do not move in lockstep. */
    clipByFamily: readonly ClipName[];
  };
  assignment: "least-used" | "hash-only";
  /** Material vocabulary. Absent means a flat two-stop gradient. */
  surface?: Surface;
}

export interface AvatarSpec {
  packId: string;
  packVersion: string;
  identity: string;
  seed: number;
  family: number;
  look: number;
  color: PaletteColor;
  path: string;
  eyes: EyeGeometry["eyes"];
  eyeRotation: number;
  durationMs: number;
  motionAmplitude: number;
  /** The loop the renderer plays for this family. */
  clip: ClipName;
  surface?: Surface;
  /** Viewport the path and eyes are drawn in. */
  viewBox: string;
}

/** Everything a renderer needs, derived from one identity and one pack. */
export function buildAvatarSpec(pack: StylePack, identity: string): AvatarSpec {
  const seed = avatarSeed(identity);
  const family = avatarFamily(seed, pack.shapes);
  const shape = pack.shapes[family]!;
  const path = outlinePath(shape.outline, {
    phase: phaseForSeed(seed),
    smoothingPasses: shape.smoothingPasses,
  });
  const color = pack.palette[colorIndex(identity, pack.palette.length)]!;
  const durationMs = pack.motion.durationMsByFamily[family] ?? pack.motion.durationMsByFamily[0]!;
  const clip = pack.motion.clipByFamily[family] ?? "breathe";

  return {
    packId: pack.id,
    packVersion: pack.version,
    identity,
    seed,
    family,
    look: avatarLook(family, pack.shapes),
    color,
    path,
    eyes: pack.eyes.eyes,
    eyeRotation: (seed % pack.eyes.rotation.modulo) - pack.eyes.rotation.spread,
    durationMs,
    motionAmplitude: pack.motion.amplitude,
    clip,
    surface: pack.surface,
    viewBox: pack.viewBox,
  };
}
