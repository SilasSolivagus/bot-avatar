import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@botavatar/engine": new URL("../../packages/engine/src/index.ts", import.meta.url).pathname,
      "@botavatar/pack-organic-blob": new URL("../../packages/style-packs/organic-blob/src/index.ts", import.meta.url).pathname,
      "@botavatar/svg": new URL("../../packages/renderer-svg/src/index.ts", import.meta.url).pathname,
    },
  },
});
