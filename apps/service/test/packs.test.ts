import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
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

  it("loads a pack from a temp directory outside the repository", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bot-avatar-pack-"));
    const file = join(directory, "temp-pack.ts");
    try {
      const pack = { ...builtinPacks()[0]!, id: "temp-pack", name: "Temp Pack" };
      await writeFile(file, `export default ${JSON.stringify(pack)};\n`, "utf8");
      const loaded = await loadPack(file);
      expect(loaded.id).toBe("temp-pack");
      expect(loaded.shapes.length).toBe(pack.shapes.length);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("validatePack", () => {
  it("accepts the builtin pack", () => {
    expect(validatePack(builtinPacks()[0], "builtin").id).toBe("organic-blob");
  });

  it("warns when a pack is too large to render exhaustively", () => {
    const base = builtinPacks()[0]!;
    const huge = {
      ...base,
      palette: Array.from({ length: 60 }, () => base.palette[0]!),
    };
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line: string) => {
      warnings.push(line);
    });
    try {
      validatePack(huge, "/tmp/huge.ts");
    } finally {
      warn.mockRestore();
    }
    expect(
      warnings.some(
        (line) =>
          line.includes("sampled") &&
          /conformance sampled \d+ renders/.test(line) &&
          line.includes("/tmp/huge.ts"),
      ),
    ).toBe(true);
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

describe("validatePack metadata", () => {
  const base = builtinPacks()[0]!;
  const rejects = (patch: Record<string, unknown>, field: RegExp) => {
    expect(() => validatePack({ ...base, ...patch }, "/tmp/bad.ts")).toThrow(PackError);
    expect(() => validatePack({ ...base, ...patch }, "/tmp/bad.ts")).toThrow(/\/tmp\/bad\.ts/);
    expect(() => validatePack({ ...base, ...patch }, "/tmp/bad.ts")).toThrow(field);
  };

  it("rejects an id with CRLF", () => {
    rejects({ id: "evil\r\nX-Injected: yes" }, /id/);
  });

  it("rejects an id with a quote", () => {
    rejects({ id: 'evil"id' }, /id/);
  });

  it("rejects an id with a comma", () => {
    rejects({ id: "evil,id" }, /id/);
  });

  it("rejects an empty id", () => {
    rejects({ id: "" }, /id/);
  });

  it("rejects an empty name", () => {
    rejects({ name: "" }, /name/);
  });

  it("rejects a name with a control character", () => {
    rejects({ name: "evil\u0007name" }, /name/);
  });

  it("rejects a malformed version", () => {
    rejects({ version: "1.0" }, /version/);
  });

  it("accepts a prerelease version", () => {
    const pack = { ...base, version: "1.2.3-beta.1" };
    expect(validatePack(pack, "x").version).toBe("1.2.3-beta.1");
  });
});

describe("validatePack render conformance", () => {
  const base = builtinPacks()[0]!;
  const rejects = (patch: Record<string, unknown>) => {
    expect(() => validatePack({ ...base, ...patch }, "/tmp/typed.ts")).toThrow(PackError);
    expect(() => validatePack({ ...base, ...patch }, "/tmp/typed.ts")).toThrow(/\/tmp\/typed\.ts/);
  };

  it("rejects a non-string viewBox", () => {
    rejects({ viewBox: 123 });
  });

  it("rejects a shape with no outline", () => {
    rejects({ shapes: [{}], motion: { durationMsByFamily: [1200], amplitude: 1 } });
  });

  it("rejects a palette entry with no colours", () => {
    rejects({ palette: [{}] });
  });

  it("rejects eyes with no rotation", () => {
    rejects({ eyes: { eyes: base.eyes.eyes } });
  });

  it("rejects a non-array surface stops value", () => {
    rejects({ surface: { stops: "x" } });
  });
});
