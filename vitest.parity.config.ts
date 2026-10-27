import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@botavatar/engine": at("./packages/engine/src/index.ts"),
      "@botavatar/pack-organic-blob": at("./packages/style-packs/organic-blob/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/engine/test/spec.test.ts",
      "packages/engine/test/outline.test.ts",
      "packages/engine/test/seed.test.ts",
      "packages/engine/test/family.test.ts",
    ],
    environment: "node",
  },
});
