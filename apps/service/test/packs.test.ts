import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { builtinPacks, loadPack, PackError, validatePack } from "../src/packs.js";

const clay = fileURLToPath(new URL("./fixtures/clay-pack.ts", import.meta.url));
const named = fileURLToPath(new URL("./fixtures/named-pack.ts", import.meta.url));
const fields = fileURLToPath(new URL("./fixtures/fields-pack.ts", import.meta.url));

describe("loadPack", () => {
  it("loads a TypeScript pack with no build step", async () => {
    const pack = await loadPack(clay);
    expect(pack.id).toBe("clay");
    expect(pack.shapes).toHaveLength(1);
    expect(pack.surface?.highlight?.opacity).toBe(0.45);
  });

  it("loads a pack from a named `pack` export", async () => {
    const pack = await loadPack(named);
    expect(pack.id).toBe("named");
    expect(pack.shapes).toHaveLength(1);
  });

  it("loads a pack whose module namespace is the pack object", async () => {
    const pack = await loadPack(fields);
    expect(pack.id).toBe("fields");
    expect(pack.shapes).toHaveLength(1);
  });

  it("returns a fresh object per call", async () => {
    const first = await loadPack(clay);
    const second = await loadPack(clay);
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe("validatePack", () => {
  it("accepts the builtin pack", () => {
    expect(validatePack(builtinPacks()[0], "builtin").id).toBe("organic-blob");
  });

  it("names the file and the missing field", () => {
    const broken = { id: "x", name: "X", version: "1.0.0" };
    expect(() => validatePack(broken, "/tmp/broken.ts")).toThrow(PackError);
    expect(() => validatePack(broken, "/tmp/broken.ts")).toThrow(/\/tmp\/broken\.ts/);
    expect(() => validatePack(broken, "/tmp/broken.ts")).toThrow(/shapes/);
  });

  it("rejects a pack with no shapes", () => {
    expect(() => validatePack({ ...builtinPacks()[0], shapes: [] }, "x")).toThrow(/shapes/);
  });

  it("rejects a pack with no palette", () => {
    expect(() => validatePack({ ...builtinPacks()[0], palette: [] }, "x")).toThrow(/palette/);
  });

  it("rejects a duration table that does not match the shapes", () => {
    const pack = { ...builtinPacks()[0], motion: { durationMsByFamily: [1200], amplitude: 1 } };
    expect(() => validatePack(pack, "x")).toThrow(/durationMsByFamily/);
  });
});
