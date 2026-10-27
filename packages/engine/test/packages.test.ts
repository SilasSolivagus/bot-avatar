import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"));

describe("published packages", () => {
  it.each(["../package.json", "../../style-packs/organic-blob/package.json", "../../renderer-svg/package.json"])(
    "%s has no runtime dependencies",
    (path) => {
      const pkg = read(path);
      expect(pkg.dependencies ?? {}).toEqual({});
      expect(pkg.peerDependencies ?? {}).toEqual({});
      expect(pkg.type).toBe("module");
    },
  );
});
