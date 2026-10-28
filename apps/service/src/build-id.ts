import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/**
 * The renderer build fingerprint. tsup substitutes this constant at build time.
 * When the source is run directly (vitest, a dev script), it falls back to
 * computing the fingerprint on the spot, so both environments agree.
 */
declare const __RENDER_BUILD__: string | undefined;

export const RENDER_BUILD: string =
  typeof __RENDER_BUILD__ === "string" ? __RENDER_BUILD__ : devFingerprint();

function devFingerprint(): string {
  // Only development and tests reach this branch. The built output carries the
  // injected constant and never reads the repository at runtime.
  const require = createRequire(import.meta.url);
  const { renderBuildFingerprint } = require("../../../scripts/render-build-lib.mjs") as {
    renderBuildFingerprint: (rootDir: string) => string;
  };
  return renderBuildFingerprint(fileURLToPath(new URL("../../..", import.meta.url)));
}
