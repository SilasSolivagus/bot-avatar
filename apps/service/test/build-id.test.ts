import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RENDER_BUILD } from "../src/build-id.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));

describe("RENDER_BUILD", () => {
  it("is 16 lowercase hex", () => {
    expect(RENDER_BUILD).toMatch(/^[0-9a-f]{16}$/);
  });

  it("matches the fingerprint of the current tree", async () => {
    const lib = (await import(
      new URL("../../../scripts/render-build-lib.mjs", import.meta.url).href
    )) as { renderBuildFingerprint: (rootDir: string) => string };
    expect(RENDER_BUILD).toBe(lib.renderBuildFingerprint(root));
  });
});
