import type { StylePack } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { createJiti } from "jiti";
import { isAbsolute, resolve } from "node:path";
import { assertPackRenders } from "./conformance.js";
import { PackError } from "./pack-error.js";

export { PackError };

const REQUIRED = ["id", "name", "version", "viewBox", "shapes", "palette", "eyes", "motion"] as const;

/** The id lands in ETags and logs, so it is restricted to URL- and header-safe characters. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
/** C0 controls, DEL and C1 controls can break a log line or an HTTP header value. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;

function requiredText(pack: Partial<StylePack>, field: "id" | "name" | "version", origin: string): string {
  const value = pack[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new PackError(`${origin}: ${field} must be a non-empty string`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new PackError(`${origin}: ${field} contains a control character`);
  }
  return value;
}

/**
 * Throws unless `candidate` is a usable pack; the message names the origin and the field.
 * A pack is usable only if every body and colour it can produce renders, so a type-broken
 * pack fails at startup instead of answering 500 to the requests that hit that combination.
 */
export function validatePack(candidate: unknown, origin: string): StylePack {
  if (typeof candidate !== "object" || candidate === null) {
    throw new PackError(`${origin}: a pack must be an object`);
  }
  const pack = candidate as Partial<StylePack>;
  const missing = REQUIRED.filter((field) => pack[field] === undefined);
  if (missing.length > 0) {
    throw new PackError(`${origin}: missing ${missing.join(", ")}`);
  }

  const id = requiredText(pack, "id", origin);
  requiredText(pack, "name", origin);
  const version = requiredText(pack, "version", origin);
  if (!ID_PATTERN.test(id)) {
    throw new PackError(`${origin}: id must match ${ID_PATTERN.source}`);
  }
  if (!VERSION_PATTERN.test(version)) {
    throw new PackError(`${origin}: version must match ${VERSION_PATTERN.source}`);
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

  const usable = pack as StylePack;
  // Exhaustive, not a smoke request: one broken family or colour must fail at startup.
  const { rendered, sampled } = assertPackRenders(usable, origin);
  if (sampled) {
    console.warn(`${origin}: pack is large, conformance sampled ${rendered} renders`);
  }

  return usable;
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
