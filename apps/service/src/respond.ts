import type { StylePack } from "@botavatar/engine";
import { createHash } from "node:crypto";

export const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** 16 hex characters of SHA-256: stable across processes, and long enough that two identities never collide. */
export function identityHash(identity: string): string {
  return createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 16);
}

export function etagFor(pack: StylePack, identity: string): string {
  return `"${pack.id}@${pack.version}:${identityHash(identity)}"`;
}

export function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } };
}
