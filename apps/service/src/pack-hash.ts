import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.js";

/** SHA-256 over the canonical form of a pack. Changes when any pack data changes, version field or not. */
export function packContentHash(pack: unknown): string {
  return createHash("sha256").update(canonicalJson(pack), "utf8").digest("hex");
}
