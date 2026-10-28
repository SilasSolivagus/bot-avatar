import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";
import { renderBuildFingerprint } from "../../scripts/render-build-lib.mjs";

// Derive the repository root from this file's location, not from the cwd, so
// the config produces the same fingerprint whether tsup is run from the
// package directory or the repository root.
const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  // build-id.ts is its own entry so the injected constant stays inspectable in
  // dist/build-id.js; the other three entries are what the service ships.
  entry: ["src/index.ts", "src/cli.ts", "src/pack-hash.ts", "src/build-id.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  define: { __RENDER_BUILD__: JSON.stringify(renderBuildFingerprint(root)) },
});
