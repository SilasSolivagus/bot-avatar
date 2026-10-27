import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@botavatar/engine": at("./packages/engine/src/index.ts"),
      "@botavatar/pack-organic-blob": at("./packages/style-packs/organic-blob/src/index.ts"),
      "@botavatar/svg": at("./packages/renderer-svg/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "parity/**"],
    environment: "node",
    passWithNoTests: true,
  },
});
