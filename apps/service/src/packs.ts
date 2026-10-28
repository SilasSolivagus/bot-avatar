import { CLIP_NAMES, PROFILE_SAMPLES } from "@botavatar/engine";
import type { ClipName, StylePack } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createJiti } from "jiti";
import { isAbsolute, resolve } from "node:path";
import { assertPackRenders } from "./conformance.js";
import { PackError } from "./pack-error.js";

export { PackError };

/**
 * A pack that passed {@link parsePack}. The brand is type-only, so a raw `StylePack`
 * cannot be passed off as validated; `createApp` accepts nothing else. This is the
 * structural boundary the spec promises: unparsed packs never reach a route.
 */
declare const validatedPackBrand: unique symbol;
export type ValidatedPack = StylePack & { readonly [validatedPackBrand]: true };

const REQUIRED = ["id", "name", "version", "viewBox", "shapes", "palette", "eyes", "motion"] as const;

/** The id lands in ETags and logs, so it is restricted to URL- and header-safe characters. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
/**
 * Semver 2.0.0: `major.minor.patch`, an optional dot-separated pre-release and optional
 * dot-separated build metadata. Every pre-release and build identifier must be non-empty,
 * so `1.2.3-` and `1.2.3+` are rejected while `1.2.3-beta.1` and `1.2.3+build.5` are accepted.
 */
const VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
/** C0 controls, DEL and C1 controls can break a log line or an HTTP header value. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
/** One plain decimal/scientific number, without the empty-string edge that `Number("")` has. */
const NUMBER_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function fail(origin: string, path: string, detail: string): never {
  throw new PackError(`${origin}: ${path} ${detail}`);
}

/** `3-7, 9` for inclusive index ranges, as used in the sampled-conformance warning. */
function formatRanges(ranges: readonly { start: number; end: number }[]): string {
  return ranges
    .map(({ start, end }) => (start === end ? `${start}` : `${start}-${end}`))
    .join(", ");
}

function expectObject(value: unknown, origin: string, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(origin, path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, origin: string, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(origin, path, "must be an array");
  return value;
}

function expectNonEmptyString(value: unknown, origin: string, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(origin, path, "must be a non-empty string");
  }
  if (CONTROL_CHARACTER.test(value)) {
    fail(origin, path, "must not contain a control character");
  }
  return value;
}

function expectFiniteNumber(value: unknown, origin: string, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(origin, path, "must be a finite number");
  }
  return value;
}

function expectPositiveNumber(value: unknown, origin: string, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(origin, path, "must be a finite positive number");
  }
  return value;
}

/** `viewBox` is four finite numbers, or the renderer falls back to silent defaults. */
function expectViewBox(value: unknown, origin: string): string {
  if (typeof value !== "string") {
    fail(origin, "viewBox", "must be a string of four finite numbers");
  }
  const parts = value.trim().split(/\s+/);
  if (value.trim().length === 0 || parts.length !== 4) {
    fail(origin, "viewBox", "must be a string of four finite numbers");
  }
  parts.forEach((part, index) => {
    if (!NUMBER_TOKEN.test(part) || !Number.isFinite(Number(part))) {
      fail(origin, `viewBox[${index}]`, "must be a finite number");
    }
  });
  return value;
}

/** Every outline point is a finite `[x, y]` pair; a string here reaches the SVG as invalid markup. */
function assertOutline(outline: readonly unknown[], origin: string, path: string): void {
  if (outline.length === 0) fail(origin, path, "must be a non-empty array");
  outline.forEach((point, index) => {
    const pointPath = `${path}[${index}]`;
    const pair = expectArray(point, origin, pointPath);
    if (pair.length !== 2) fail(origin, pointPath, "must be a [number, number] pair");
    expectFiniteNumber(pair[0], origin, `${pointPath}[0]`);
    expectFiniteNumber(pair[1], origin, `${pointPath}[1]`);
  });
}

/**
 * A radius profile is exactly `PROFILE_SAMPLES` samples, every one positive and
 * finite, with a finite sum. Validated here with the same rigour as an outline rather
 * than left to the engine: a malformed profile must fail at startup, naming the
 * sample, not turn into a NaN path on the request that happens to draw it.
 */
function assertRadiiProfile(radii: readonly unknown[], origin: string, path: string): void {
  if (radii.length !== PROFILE_SAMPLES) {
    fail(origin, path, `must have ${PROFILE_SAMPLES} samples, got ${radii.length}`);
  }
  let sum = 0;
  radii.forEach((radius, index) => {
    const samplePath = `${path}[${index}]`;
    const value = expectPositiveNumber(radius, origin, samplePath);
    sum += value;
  });
  if (!Number.isFinite(sum)) fail(origin, path, "must have a finite sum");
}

/**
 * A family carries exactly one representation: a polygon `outline` or a 64-sample
 * `radii` profile. Requiring exactly one keeps the two render paths unambiguous.
 */
function assertShapes(value: unknown, origin: string): number {
  const shapes = expectArray(value, origin, "shapes");
  if (shapes.length === 0) fail(origin, "shapes", "must be a non-empty array");
  shapes.forEach((shape, family) => {
    const path = `shapes[${family}]`;
    const entry = expectObject(shape, origin, path);
    const hasOutline = entry.outline !== undefined;
    const hasRadii = entry.radii !== undefined;
    if (hasOutline === hasRadii) {
      fail(origin, path, "must have exactly one of outline or radii");
    }
    if (hasRadii) {
      const radiiPath = `${path}.radii`;
      const radii = expectArray(entry.radii, origin, radiiPath);
      assertRadiiProfile(radii, origin, radiiPath);
      return;
    }
    assertOutline(expectArray(entry.outline, origin, `${path}.outline`), origin, `${path}.outline`);
  });
  return shapes.length;
}

function assertPalette(value: unknown, origin: string): void {
  const palette = expectArray(value, origin, "palette");
  if (palette.length === 0) fail(origin, "palette", "must be a non-empty array");
  palette.forEach((entry, index) => {
    const path = `palette[${index}]`;
    const color = expectObject(entry, origin, path);
    for (const field of ["id", "name", "light", "dark", "eye"] as const) {
      expectNonEmptyString(color[field], origin, `${path}.${field}`);
    }
  });
}

/** The band an eye's aspect must *not* fall in, or a tilt would be invisible. */
const TILT_ASPECT_BANDS = {
  steep: [0.6, 1.7],
  shallow: [0.8, 1.25],
} as const;

/**
 * A tilt only reads on an eye that is not round. Above 20° the eye may be only
 * moderately elongated; below it the capsule must be clearly longer than wide,
 * which is why the narrow band is the stricter one.
 */
function assertTiltVisible(
  tiltDeg: number,
  halfWidth: number,
  halfHeight: number,
  origin: string,
  path: string,
): void {
  const aspect = halfWidth / halfHeight;
  const [low, high] = Math.abs(tiltDeg) >= 20 ? TILT_ASPECT_BANDS.steep : TILT_ASPECT_BANDS.shallow;
  if (aspect >= low && aspect <= high) {
    fail(
      origin,
      path,
      `must be on a non-circular eye: aspect ${aspect} lies within [${low}, ${high}] at ${tiltDeg}°`,
    );
  }
}

/**
 * Sphere eyes are two capsules bound to a radius, not a list of rects. The
 * numeric contract is validated here; the geometry the renderer actually draws
 * is derived from the body outline by `buildGeometry`, so `halfWidth`/`halfHeight`
 * of 0/0 is the documented "derive it" placeholder and skips the size and tilt
 * rules. Anything else must describe a real capsule.
 */
function assertSphereEyes(eyes: Record<string, unknown>, origin: string): void {
  const radius = expectFiniteNumber(eyes.sphereRadius, origin, "eyes.sphereRadius");
  if (radius <= 0) fail(origin, "eyes.sphereRadius", "must be a positive number");

  const entries = expectArray(eyes.eyes, origin, "eyes.eyes");
  if (entries.length !== 2) {
    fail(origin, "eyes.eyes", `must have exactly 2 entries, got ${entries.length}`);
  }
  entries.forEach((eye, index) => {
    const path = `eyes.eyes[${index}]`;
    const entry = expectObject(eye, origin, path);
    for (const field of ["lateralDeg", "verticalDeg", "halfWidth", "halfHeight", "tiltDeg"] as const) {
      expectFiniteNumber(entry[field], origin, `${path}.${field}`);
    }
    const halfWidth = entry.halfWidth as number;
    const halfHeight = entry.halfHeight as number;
    if (halfWidth === 0 && halfHeight === 0) return;
    if (halfWidth <= 0) fail(origin, `${path}.halfWidth`, "must be a positive number");
    if (halfHeight <= 0) fail(origin, `${path}.halfHeight`, "must be a positive number");
    assertTiltVisible(entry.tiltDeg as number, halfWidth, halfHeight, origin, `${path}.tiltDeg`);
  });

  const cull = expectFiniteNumber(eyes.cullAtDepth, origin, "eyes.cullAtDepth");
  const fade = expectFiniteNumber(eyes.fadeFromDepth, origin, "eyes.fadeFromDepth");
  if (cull < 0 || cull > 1) fail(origin, "eyes.cullAtDepth", "must be within [0, 1]");
  if (fade < 0 || fade > 1) fail(origin, "eyes.fadeFromDepth", "must be within [0, 1]");
  if (cull >= fade) fail(origin, "eyes.cullAtDepth", "must be less than eyes.fadeFromDepth");

  // Optional: only validated when the pack actually declares them.
  for (const field of ["bodyCoupling", "bodyPitchFollow"] as const) {
    if (eyes[field] === undefined) continue;
    const value = expectFiniteNumber(eyes[field], origin, `eyes.${field}`);
    if (value < 0 || value > 1) fail(origin, `eyes.${field}`, "must be within [0, 1]");
  }
  // The paint choice changes what the renderer needs (a surface colour), so an
  // unknown value must fail here rather than reach the renderer.
  if (eyes.eyePaint !== undefined && eyes.eyePaint !== "surface" && eyes.eyePaint !== "ink") {
    fail(origin, "eyes.eyePaint", 'must be "surface" or "ink"');
  }
  for (const field of ["anchorY", "restTiltDeg"] as const) {
    if (eyes[field] === undefined) continue;
    expectFiniteNumber(eyes[field], origin, `eyes.${field}`);
  }
}

/** An eye is one valid discriminator plus exactly that variant's finite geometry fields. */
function assertEyes(value: unknown, origin: string): void {
  const eyes = expectObject(value, origin, "eyes");
  // v1 packs omit `kind`; an explicit discriminator must still be one of the two.
  const kind = eyes.kind;
  if (kind !== undefined && kind !== "rect" && kind !== "sphere") {
    fail(origin, "eyes.kind", 'must be "rect" or "sphere"');
  }
  if (kind === "sphere") {
    assertSphereEyes(eyes, origin);
    return;
  }
  const entries = expectArray(eyes.eyes, origin, "eyes.eyes");
  if (entries.length === 0) fail(origin, "eyes.eyes", "must be a non-empty array");
  entries.forEach((eye, index) => {
    const path = `eyes.eyes[${index}]`;
    const entry = expectObject(eye, origin, path);
    if (entry.kind === "rect") {
      for (const field of ["x", "y", "width", "height", "rx"] as const) {
        expectFiniteNumber(entry[field], origin, `${path}.${field}`);
      }
    } else if (entry.kind === "ellipse") {
      for (const field of ["cx", "cy", "rx", "ry"] as const) {
        expectFiniteNumber(entry[field], origin, `${path}.${field}`);
      }
    } else {
      fail(origin, `${path}.kind`, 'must be "rect" or "ellipse"');
    }
  });
  const rotation = expectObject(eyes.rotation, origin, "eyes.rotation");
  expectFiniteNumber(rotation.modulo, origin, "eyes.rotation.modulo");
  expectFiniteNumber(rotation.spread, origin, "eyes.rotation.spread");
}

function assertMotion(value: unknown, origin: string, familyCount: number): void {
  const motion = expectObject(value, origin, "motion");
  const durations = expectArray(motion.durationMsByFamily, origin, "motion.durationMsByFamily");
  if (durations.length !== familyCount) {
    throw new PackError(
      `${origin}: durationMsByFamily has ${durations.length} entries for ${familyCount} shapes`,
    );
  }
  durations.forEach((duration, index) => {
    expectPositiveNumber(duration, origin, `motion.durationMsByFamily[${index}]`);
  });
  expectFiniteNumber(motion.amplitude, origin, "motion.amplitude");
  const clips = expectArray(motion.clipByFamily, origin, "motion.clipByFamily");
  if (clips.length !== familyCount) {
    throw new PackError(
      `${origin}: motion.clipByFamily has ${clips.length} entries for ${familyCount} shapes`,
    );
  }
  clips.forEach((clip, index) => {
    if (typeof clip !== "string" || !CLIP_NAMES.includes(clip as ClipName)) {
      fail(origin, `motion.clipByFamily[${index}]`, `must be one of ${CLIP_NAMES.join(", ")}`);
    }
  });
}

/**
 * Rejects data the canonical hash cannot represent, with the exact field path. Without
 * this, a `Date`, `Map` or `undefined` extra field would escape `parsePack` and surface
 * later as a bare `CanonicalError` from inside `packContentHash`, with no origin.
 */
function assertRepresentable(value: unknown, path: string, origin: string, seen: Set<object>): void {
  switch (typeof value) {
    case "string":
    case "boolean":
      return;
    case "number":
      if (!Number.isFinite(value)) fail(origin, path, "must be a finite number");
      return;
    case "undefined":
      fail(origin, path, "must not be undefined");
      return;
    case "object": {
      if (value === null) return;
      if (seen.has(value)) fail(origin, path, "must not be circular");
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          // Index loop, not `forEach`: a sparse hole is an `undefined` entry to the hash.
          for (let index = 0; index < value.length; index += 1) {
            assertRepresentable(value[index], `${path}[${index}]`, origin, seen);
          }
          return;
        }
        const proto = Object.getPrototypeOf(value) as object | null;
        if (proto !== null && proto !== Object.prototype) {
          const name = (proto.constructor as { name?: string } | undefined)?.name ?? "a non-plain object";
          fail(origin, path, `must be plain data, got ${name}`);
        }
        for (const key of Object.keys(value as Record<string, unknown>)) {
          const fieldPath = path.length === 0 ? key : `${path}.${key}`;
          assertRepresentable((value as Record<string, unknown>)[key], fieldPath, origin, seen);
        }
        return;
      } finally {
        seen.delete(value);
      }
    }
    default:
      fail(origin, path, `must be plain data, got ${typeof value}`);
  }
}

/**
 * The only entry into the service for pack data. Throws `PackError` unless `candidate`
 * is a usable pack; the message names `origin` and the exact field path, so a bad pack
 * exits at startup (through `loadPack`/`main`) instead of answering 500 per request.
 */
export function parsePack(candidate: unknown, origin: string): ValidatedPack {
  if (typeof candidate !== "object" || candidate === null) {
    throw new PackError(`${origin}: a pack must be an object`);
  }
  const pack = candidate as Record<string, unknown>;
  const missing = REQUIRED.filter((field) => pack[field] === undefined);
  if (missing.length > 0) {
    throw new PackError(`${origin}: missing ${missing.join(", ")}`);
  }

  const id = expectNonEmptyString(pack.id, origin, "id");
  expectNonEmptyString(pack.name, origin, "name");
  const version = expectNonEmptyString(pack.version, origin, "version");
  if (!ID_PATTERN.test(id)) {
    throw new PackError(`${origin}: id must match ${ID_PATTERN.source}`);
  }
  if (!VERSION_PATTERN.test(version)) {
    throw new PackError(
      `${origin}: version must be semver (for example 1.2.3, 1.2.3-beta.1 or 1.2.3+build.5)`,
    );
  }

  const familyCount = assertShapes(pack.shapes, origin);
  assertPalette(pack.palette, origin);
  assertEyes(pack.eyes, origin);
  assertMotion(pack.motion, origin, familyCount);
  expectViewBox(pack.viewBox, origin);
  assertRepresentable(pack, "", origin, new Set());

  const usable = pack as unknown as StylePack;
  // Exhaustive, not a smoke request: one broken family or colour must fail at startup.
  const { rendered, sampled, uncovered } = assertPackRenders(usable, origin);
  if (sampled) {
    const missed: string[] = [];
    if (uncovered.shapes.length > 0) {
      missed.push(`uncovered shapes ${formatRanges(uncovered.shapes)}`);
    }
    if (uncovered.colors.length > 0) {
      missed.push(`uncovered colours ${formatRanges(uncovered.colors)}`);
    }
    const detail = missed.length > 0 ? `; ${missed.join("; ")}` : "";
    console.warn(`${origin}: pack is large, conformance sampled ${rendered} renders${detail}`);
  }

  return usable as ValidatedPack;
}

/**
 * Picks the pack out of a module namespace. Jiti's ESM interop exposes a
 * synthetic `default` that mirrors the namespace when the module has no real
 * default export, so only an own `default` property counts as a default export.
 */
function packFrom(namespace: unknown): unknown {
  const own = (key: "default" | "pack"): unknown => {
    if (typeof namespace !== "object" || namespace === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(namespace, key)) return undefined;
    return (namespace as Record<string, unknown>)[key];
  };
  return own("default") ?? own("pack") ?? namespace;
}

/** Loads a pack module from disk. Jiti transpiles TypeScript on the fly, so no build step is needed. */
export async function loadPack(path: string): Promise<ValidatedPack> {
  const target = isAbsolute(path) ? path : resolve(process.cwd(), path);
  // A fresh module instance per call: callers own the returned pack and may mutate it.
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  let namespace: unknown;
  try {
    namespace = await jiti.import(target);
  } catch (error) {
    throw new PackError(`${target}: could not be imported (${(error as Error).message})`);
  }
  return parsePack(packFrom(namespace), target);
}

/** Parsed once at module load: the builtin is validated exactly like a `--pack` file. */
const BUILTIN: readonly ValidatedPack[] = [parsePack(organicBlob, "builtin:organic-blob")];

export function builtinPacks(): ValidatedPack[] {
  return [...BUILTIN];
}
