import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { packContentHash } from "../src/pack-hash.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));

/** Same data, reverse key insertion order at every depth. */
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .reverse()
      .map((key) => [key, reorderKeys((value as Record<string, unknown>)[key])]),
  );
}

describe("packContentHash", () => {
  it("is 64 hex characters and stable in-process", () => {
    const first = packContentHash(organicBlob);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(packContentHash(organicBlob)).toBe(first);
  });

  it("ignores key insertion order", () => {
    const reordered = reorderKeys(organicBlob);
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(organicBlob));
    expect(packContentHash(reordered)).toBe(packContentHash(organicBlob));
  });

  it("changes when a single colour changes", () => {
    const touched = structuredClone(organicBlob);
    (touched.palette[3] as { dark: string }).dark = "#000001";
    expect(packContentHash(touched)).not.toBe(packContentHash(organicBlob));
  });

  it("is identical in a separate process", () => {
    const script = `
      import { organicBlob } from "@botavatar/pack-organic-blob";
      import { packContentHash } from "./apps/service/dist/pack-hash.js";
      process.stdout.write(packContentHash(organicBlob));
    `;
    const other = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      encoding: "utf8",
    });
    expect(other.trim()).toBe(packContentHash(organicBlob));
  });
});
