import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"));

const manifests = [
  "../package.json",
  "../../style-packs/organic-blob/package.json",
  "../../renderer-svg/package.json",
];

describe("published packages", () => {
  it.each(manifests)("%s has no runtime dependencies", (path) => {
    const pkg = read(path);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
    expect(pkg.type).toBe("module");
  });

  it.each(manifests)("%s ships its licence and notice", (path) => {
    const pkg = read(path);
    expect(pkg.license).toBe("Apache-2.0");
    expect(pkg.files).toEqual(expect.arrayContaining(["LICENSE", "NOTICE"]));

    const directory = dirname(fileURLToPath(new URL(path, import.meta.url)));
    for (const file of ["LICENSE", "NOTICE"]) {
      expect(existsSync(join(directory, file))).toBe(true);
    }
  });
});
