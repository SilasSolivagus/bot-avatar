import type { StylePack } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createJiti } from "jiti";
import { isAbsolute, resolve } from "node:path";

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackError";
  }
}

const REQUIRED = ["id", "name", "version", "viewBox", "shapes", "palette", "eyes", "motion"] as const;

/** Throws unless `candidate` is a usable pack; the message names the origin and the field. */
export function validatePack(candidate: unknown, origin: string): StylePack {
  if (typeof candidate !== "object" || candidate === null) {
    throw new PackError(`${origin}: a pack must be an object`);
  }
  const pack = candidate as Partial<StylePack>;
  const missing = REQUIRED.filter((field) => pack[field] === undefined);
  if (missing.length > 0) {
    throw new PackError(`${origin}: missing ${missing.join(", ")}`);
  }
  if (!Array.isArray(pack.shapes) || pack.shapes.length === 0) {
    throw new PackError(`${origin}: shapes must be a non-empty array`);
  }
  if (!Array.isArray(pack.palette) || pack.palette.length === 0) {
    throw new PackError(`${origin}: palette must be a non-empty array`);
  }
  if (!Array.isArray(pack.motion?.durationMsByFamily)) {
    throw new PackError(`${origin}: motion.durationMsByFamily must be an array`);
  }
  if (pack.motion.durationMsByFamily.length !== pack.shapes.length) {
    throw new PackError(
      `${origin}: durationMsByFamily has ${pack.motion.durationMsByFamily.length} entries for ${pack.shapes.length} shapes`,
    );
  }
  if (!Array.isArray(pack.eyes?.eyes) || pack.eyes.eyes.length === 0) {
    throw new PackError(`${origin}: eyes.eyes must be a non-empty array`);
  }
  return pack as StylePack;
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
export async function loadPack(path: string): Promise<StylePack> {
  const target = isAbsolute(path) ? path : resolve(process.cwd(), path);
  // A fresh module instance per call: callers own the returned pack and may mutate it.
  const jiti = createJiti(import.meta.url, { moduleCache: false });
  let namespace: unknown;
  try {
    namespace = await jiti.import(target);
  } catch (error) {
    throw new PackError(`${target}: could not be imported (${(error as Error).message})`);
  }
  return validatePack(packFrom(namespace), target);
}

export function builtinPacks(): StylePack[] {
  return [organicBlob];
}
