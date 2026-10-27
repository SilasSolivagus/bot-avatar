import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const roots = ["../../engine/src", "../../style-packs/organic-blob/src", "../../renderer-svg/src"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("zero brand", () => {
  it("names no upstream brand anywhere in the sources", () => {
    for (const root of roots) {
      for (const file of files(root)) {
        const text = readFileSync(file, "utf8");
        expect(text).not.toMatch(/rakazo|shoalwork/i);
      }
    }
  });
});
