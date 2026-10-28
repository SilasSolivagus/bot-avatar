import { colorIndex } from "./color.js";
import type { ClipName } from "./clips.js";
import { avatarFamily, avatarLook } from "./family.js";
import { outlinePath, phaseForSeed } from "./outline.js";
import { assertRadii, radiiToPath } from "./profile.js";
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
  /**
   * 120x120 coordinate space, origin at the centre; a closed polygon.
   *
   * Exactly one of `outline` / `radii` is present at runtime. The type still declares
   * this one required because the legacy consumers (the service's conformance sweep and
   * the gallery's pack tests) dereference it without a guard, and this step must not
   * touch `apps/`; a profile family therefore declares itself through
   * {@link radiiShape}, the same boundary-cast pattern `build-geometry.ts` uses for the
   * v1 eye types. `parsePack` will enforce the either/or rule at startup.
   */
  outline: ReadonlyArray<readonly [number, number]>;
  /** 64 equal-angle radii, the shape model the reference implementation uses. */
  radii?: readonly number[];
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

/**
 * Declares a `radii` shape family.
 *
 * A profile carries no polygon, but {@link ShapeFamily.outline} is still typed as one
 * while the legacy consumers migrate. This is the single boundary cast for the new
 * representation: the returned family has `radii` and no `outline` at runtime, which is
 * the contract `parsePack` validates.
 */
export function radiiShape(radii: readonly number[]): ShapeFamily {
  assertRadii(radii, "radiiShape");
  return { radii } as unknown as ShapeFamily;
}

/** Everything a renderer needs, derived from one identity and one pack. */
export function buildAvatarSpec(pack: StylePack, identity: string): AvatarSpec {
  const seed = avatarSeed(identity);
  const family = avatarFamily(seed, pack.shapes);
  const shape = pack.shapes[family]!;
  // A radii family draws its sample points directly; an outline family keeps the exact
  // v1 pipeline (affine phase distortion, then Chaikin, then Catmull-Rom).
  const path = shape.radii
    ? radiiToPath(shape.radii)
    : outlinePath(shape.outline, {
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
