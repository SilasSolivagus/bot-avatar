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
  /**
   * The surface colour the avatar is drawn on. A pack that paints its eyes with the
   * surface colour produces different bytes for every value, so it must be part of
   * the cache key. Absent hashes as the empty string, keeping a `bg`-less request on
   * a distinct tag from any explicit colour.
   */
  surface?: string;
  /**
   * The renderer build fingerprint. A renderer change can alter the bytes of an
   * avatar without changing the pack, the identity or the options, so the build
   * is part of the cache key: an upgrade invalidates every cached avatar once.
   */
  renderBuild: string;
}

/**
 * Opaque cache tag: a hash over hashes. The pack content hash, the identity hash,
 * the render options (including the surface colour), the representation kind and the
 * renderer build are the only inputs, so no pack or identity text can appear in the
 * result.
 */
export function avatarTag({
  packHash,
  identity,
  size,
  state,
  kind = "svg",
  surface = "",
  renderBuild,
}: TagInput): string {
  const digest = createHash("sha256")
    .update(
      `${packHash}|${identityHash(identity)}|${size}|${state}|${kind}|${renderBuild}|${surface}`,
      "utf8",
    )
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
