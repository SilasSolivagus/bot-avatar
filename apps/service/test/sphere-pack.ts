import type { StylePack } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";

/**
 * A lawful sphere eye block. The capsule is 1 × 2.27, i.e. an aspect of 0.44,
 * which is well outside the 0.8–1.25 band a tilt would be invisible in — the
 * same long eye shape `orb` and `geo` derive from their outlines.
 */
export const sphereEye = {
  lateralDeg: 18,
  verticalDeg: 0,
  halfWidth: 1,
  halfHeight: 2.27,
  tiltDeg: 0,
};

export interface SpherePackOptions {
  shapes?: number;
  colors?: number;
  /** Replaces whole fields of the eye block, so a test can inject a bad value. */
  eyes?: Record<string, unknown>;
}

/** A sphere pack built from organic-blob's bodies, with a small default domain. */
export function spherePack(options: SpherePackOptions = {}): Record<string, unknown> {
  const base = structuredClone(organicBlob) as unknown as Record<string, unknown>;
  const shapeCount = options.shapes ?? 2;
  const colorCount = options.colors ?? 3;
  const sourceShapes = base.shapes as Array<Record<string, unknown>>;
  const sourcePalette = base.palette as Array<Record<string, unknown>>;
  const motion = base.motion as {
    durationMsByFamily: readonly number[];
    amplitude: number;
    clipByFamily: readonly string[];
  };
  const shapes = Array.from({ length: shapeCount }, (_, index) =>
    structuredClone(sourceShapes[index % sourceShapes.length]!),
  );
  const palette = Array.from({ length: colorCount }, (_, index) =>
    structuredClone(sourcePalette[index % sourcePalette.length]!),
  );

  return {
    ...base,
    shapes,
    palette,
    motion: {
      durationMsByFamily: shapes.map(
        (_, index) => motion.durationMsByFamily[index % motion.durationMsByFamily.length]!,
      ),
      amplitude: motion.amplitude,
      clipByFamily: shapes.map(
        (_, index) => motion.clipByFamily[index % motion.clipByFamily.length]!,
      ),
    },
    eyes: {
      kind: "sphere",
      sphereRadius: 44,
      eyes: [
        { ...sphereEye },
        { ...sphereEye, lateralDeg: -sphereEye.lateralDeg },
      ],
      fadeFromDepth: 0.12,
      cullAtDepth: 0.02,
      bodyCoupling: 0.35,
      ...options.eyes,
    },
  };
}

/** The same pack as a `StylePack`, for the sweep that takes the typed entry point. */
export function spherePackAsStylePack(options: SpherePackOptions = {}): StylePack {
  return spherePack(options) as unknown as StylePack;
}
