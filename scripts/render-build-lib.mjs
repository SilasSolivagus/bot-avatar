import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The directories whose source code decides how avatars are drawn. Paths are
 * relative to the repository root passed to `renderBuildFingerprint`.
 */
export const RENDER_BUILD_SOURCES = [
  "packages/engine/src",
  "packages/renderer-svg/src",
];

const IGNORED = /\.test\.[cm]?[jt]sx?$/;

/**
 * Content fingerprint of the rendering sources, as 16 lowercase hex chars
 * (the same shape as an ETag). Depends only on each file's repository-relative
 * path and bytes: no mtimes, no git metadata, no environment.
 *
 * Files are sorted by path before hashing, so a fingerprint does not depend on
 * the order the filesystem happens to list a directory in.
 */
export function renderBuildFingerprint(rootDir) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!IGNORED.test(entry.name)) files.push(full);
    }
  };
  for (const source of RENDER_BUILD_SOURCES) walk(join(rootDir, source));

  const rows = files.map((file) => [relative(rootDir, file), file]);
  rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const hash = createHash("sha256");
  for (const [path, file] of rows) {
    hash.update(path);
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
