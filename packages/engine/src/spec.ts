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
  surface?: Surface;
  /** Viewport the path and eyes are drawn in. */
  viewBox: string;
}
