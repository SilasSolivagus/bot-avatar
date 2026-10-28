import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderBuildFingerprint } from "./render-build-lib.mjs";

const ENGINE = "packages/engine/src";
const RENDERER = "packages/renderer-svg/src";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "render-build-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("is stable for the same tree", () => {
  const root = fixture({ [`${ENGINE}/a.ts`]: "export const a = 1;\n" });
  assert.equal(renderBuildFingerprint(root), renderBuildFingerprint(root));
});

test("changes when a source file changes", () => {
  const one = fixture({ [`${ENGINE}/a.ts`]: "export const a = 1;\n" });
  const two = fixture({ [`${ENGINE}/a.ts`]: "export const a = 2;\n" });
  assert.notEqual(renderBuildFingerprint(one), renderBuildFingerprint(two));
});

test("ignores test files and unrelated directories", () => {
  const base = fixture({ [`${ENGINE}/a.ts`]: "export const a = 1;\n" });
  const withNoise = fixture({
    [`${ENGINE}/a.ts`]: "export const a = 1;\n",
    [`${ENGINE}/a.test.ts`]: "// no\n",
    "apps/service/src/main.ts": "// not rendered\n",
  });
  assert.equal(renderBuildFingerprint(base), renderBuildFingerprint(withNoise));
});

test("is independent of file creation order", () => {
  const one = fixture({ [`${ENGINE}/a.ts`]: "A", [`${RENDERER}/b.ts`]: "B" });
  const two = fixture({ [`${RENDERER}/b.ts`]: "B", [`${ENGINE}/a.ts`]: "A" });
  assert.equal(renderBuildFingerprint(one), renderBuildFingerprint(two));
});
