import { describe, expect, it } from "vitest";
import { galleryPacks } from "../src/packs.js";

describe("galleryPacks", () => {
  it("puts the builtin first and discovers local packs once each", () => {
    const entries = galleryPacks();
    expect(entries[0]!.pack.id).toBe("organic-blob");
    expect(entries.map((entry) => entry.pack.id)).toContain("clay");
    expect(new Set(entries.map((entry) => entry.pack.id)).size).toBe(entries.length);
  });

  it("labels a local pack with the file it came from", () => {
    const clay = galleryPacks().find((entry) => entry.pack.id === "clay");
    expect(clay?.label).toBe("Clay (clay)");
  });
});
