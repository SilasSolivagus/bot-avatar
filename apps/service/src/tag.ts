import type { StylePack } from "@botavatar/engine";
import { createHash } from "node:crypto";
import { identityHash } from "./respond.js";

export type TagKind = "svg" | "json" | "png";

export interface TagInput {
  packHash: string;
  identity: string;
  size: number;
  state: string;
  /**
   * Which representation the tag belongs to. A PNG and an SVG of the same avatar
   * share every other input, so without this marker one could validate the other.
   * Defaults to `svg` so older callers keep an SVG-scoped tag.
   */
  kind?: TagKind;
}

/**
 * Opaque cache tag: a hash over hashes. The pack content hash, the identity hash,
 * the render options and the representation kind are the only inputs, so no pack
 * or identity text can appear in the result.
 */
export function avatarTag({ packHash, identity, size, state, kind = "svg" }: TagInput): string {
  const digest = createHash("sha256")
    .update(`${packHash}|${identityHash(identity)}|${size}|${state}|${kind}`, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `"${digest}"`;
}

/**
 * True when `If-None-Match` selects the current representation. The header is a comma-separated
 * list of opaque tags; `*` selects any representation and a `W/` prefix means weak comparison,
 * which still matches on the opaque tag value (RFC 9110 §13.1.2).
 */
export function matchesIfNoneMatch(header: string | undefined, tag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  return header.split(",").some((entry) => entry.trim().replace(/^W\//, "") === tag);
}

/** The readable, informational form of a pack's identity. It never participates in caching. */
export function packHeader(pack: Pick<StylePack, "id" | "version">): string {
  return `${pack.id}@${pack.version}`;
}
