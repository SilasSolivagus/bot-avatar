import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { builtinPacks, loadPack, PackError, parsePack } from "../src/packs.js";
import { sphereEye, spherePack } from "./sphere-pack.js";

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

describe("parsePack", () => {
  it("accepts the builtin pack", () => {
    expect(parsePack(builtinPacks()[0], "builtin").id).toBe("organic-blob");
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
      parsePack(huge, "/tmp/huge.ts");
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

  it("logs the concrete uncovered shape ranges for a sampled pack", () => {
    const base = builtinPacks()[0]!;
    const shapes = Array.from({ length: 510 }, (_, index) =>
      structuredClone(base.shapes[index % base.shapes.length]!),
    );
    const sampled = {
      ...base,
      shapes,
      palette: [base.palette[0]!],
      motion: {
        ...base.motion,
        durationMsByFamily: shapes.map(
          (_, index) =>
            base.motion.durationMsByFamily[index % base.motion.durationMsByFamily.length]!,
        ),
        clipByFamily: shapes.map(
          (_, index) => base.motion.clipByFamily[index % base.motion.clipByFamily.length]!,
        ),
      },
    };
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((line: string) => {
      warnings.push(line);
    });
    try {
      parsePack(sampled, "/tmp/many-shapes.ts");
    } finally {
      warn.mockRestore();
    }
    const line = warnings.find((entry) => entry.includes("/tmp/many-shapes.ts"));
    expect(line).toBeDefined();
    expect(line).toContain("sampled");
    expect(line).toMatch(/conformance sampled \d+ renders/);
    expect(line).toMatch(/uncovered shapes \d+(?:-\d+)?/);
  });

  it("names the file and the missing field", () => {
    const broken = { id: "x", name: "X", version: "1.0.0" };
    expect(() => parsePack(broken, "/tmp/broken.ts")).toThrow(PackError);
    expect(() => parsePack(broken, "/tmp/broken.ts")).toThrow(/\/tmp\/broken\.ts/);
    expect(() => parsePack(broken, "/tmp/broken.ts")).toThrow(/shapes/);
  });

  it("rejects a pack with no shapes", () => {
    expect(() => parsePack({ ...builtinPacks()[0], shapes: [] }, "x")).toThrow(/shapes/);
  });

  it("rejects a pack with no palette", () => {
    expect(() => parsePack({ ...builtinPacks()[0], palette: [] }, "x")).toThrow(/palette/);
  });

  it("rejects a duration table that does not match the shapes", () => {
    const pack = { ...builtinPacks()[0], motion: { durationMsByFamily: [1200], amplitude: 1 } };
    expect(() => parsePack(pack, "x")).toThrow(/durationMsByFamily/);
  });
});

describe("parsePack metadata", () => {
  const base = builtinPacks()[0]!;
  const rejects = (patch: Record<string, unknown>, field: RegExp) => {
    expect(() => parsePack({ ...base, ...patch }, "/tmp/bad.ts")).toThrow(PackError);
    expect(() => parsePack({ ...base, ...patch }, "/tmp/bad.ts")).toThrow(/\/tmp\/bad\.ts/);
    expect(() => parsePack({ ...base, ...patch }, "/tmp/bad.ts")).toThrow(field);
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
    expect(parsePack(pack, "x").version).toBe("1.2.3-beta.1");
  });

  it("accepts semver build metadata", () => {
    const pack = { ...base, version: "1.2.3+build.5" };
    expect(parsePack(pack, "x").version).toBe("1.2.3+build.5");
  });

  it("rejects an empty prerelease identifier", () => {
    rejects({ version: "1.2.3-" }, /version/);
  });

  it("rejects an empty build identifier", () => {
    rejects({ version: "1.2.3+" }, /version/);
  });
});

describe("parsePack field types", () => {
  const base = builtinPacks()[0]!;

  it("rejects a string eye coordinate, naming the exact path", () => {
    const broken = structuredClone(base);
    (broken.eyes.eyes[0] as { x: unknown }).x = "x";
    expect(() => parsePack(broken, "/tmp/typed.ts")).toThrow(PackError);
    expect(() => parsePack(broken, "/tmp/typed.ts")).toThrow(/\/tmp\/typed\.ts/);
    expect(() => parsePack(broken, "/tmp/typed.ts")).toThrow(/eyes\.eyes\[0\]\.x/);
  });

  it("rejects a non-finite outline point, naming the exact path", () => {
    const broken = structuredClone(base);
    (broken.shapes[0] as { outline: unknown }).outline = [[Number.NaN, 0], [0, 0], [0, 10]];
    expect(() => parsePack(broken, "x")).toThrow(/shapes\[0\]\.outline\[0\]\[0\]/);
  });

  it("rejects a non-numeric duration", () => {
    const durationMsByFamily = base.motion.durationMsByFamily.map(() => "slow");
    const broken = { ...base, motion: { durationMsByFamily, amplitude: 1 } };
    expect(() => parsePack(broken, "x")).toThrow(/motion\.durationMsByFamily\[0\]/);
  });

  it("rejects a non-finite motion amplitude", () => {
    const broken = { ...base, motion: { ...base.motion, amplitude: Number.POSITIVE_INFINITY } };
    expect(() => parsePack(broken, "x")).toThrow(/motion\.amplitude/);
  });

  it("rejects a clip name outside the library, naming the origin and index", () => {
    const clipByFamily: string[] = base.motion.clipByFamily.map(() => "breathe");
    clipByFamily[2] = "moonwalk";
    const broken = { ...base, motion: { ...base.motion, clipByFamily } };
    expect(() => parsePack(broken, "/tmp/bad-clip.ts")).toThrow(PackError);
    expect(() => parsePack(broken, "/tmp/bad-clip.ts")).toThrow(/\/tmp\/bad-clip\.ts/);
    expect(() => parsePack(broken, "/tmp/bad-clip.ts")).toThrow(/motion\.clipByFamily\[2\]/);
  });

  it("rejects a clip table that does not match the shapes, naming origin and table", () => {
    const broken = { ...base, motion: { ...base.motion, clipByFamily: ["breathe"] } };
    expect(() => parsePack(broken, "/tmp/bad-clip-table.ts")).toThrow(PackError);
    expect(() => parsePack(broken, "/tmp/bad-clip-table.ts")).toThrow(/\/tmp\/bad-clip-table\.ts/);
    expect(() => parsePack(broken, "/tmp/bad-clip-table.ts")).toThrow(/motion\.clipByFamily/);
  });

  it("rejects a viewBox that is not four finite numbers", () => {
    expect(() => parsePack({ ...base, viewBox: "-60 -60 120" }, "x")).toThrow(/viewBox/);
  });
});

describe("parsePack diagnostics for unrepresentable data", () => {
  const base = builtinPacks()[0]!;
  const rejects = (patch: Record<string, unknown>, field: RegExp) => {
    expect(() => parsePack({ ...base, ...patch }, "/tmp/extra.ts")).toThrow(PackError);
    expect(() => parsePack({ ...base, ...patch }, "/tmp/extra.ts")).toThrow(/\/tmp\/extra\.ts/);
    expect(() => parsePack({ ...base, ...patch }, "/tmp/extra.ts")).toThrow(field);
  };

  it("rejects a Date extra field with its own path", () => {
    rejects({ createdAt: new Date(0) }, /createdAt/);
  });

  it("rejects a Map extra field with its own path", () => {
    rejects({ metadata: new Map([["a", 1]]) }, /metadata/);
  });

  it("rejects an undefined extra field with its own path", () => {
    rejects({ note: undefined }, /note/);
  });
});

describe("parsePack render conformance", () => {
  const base = builtinPacks()[0]!;
  const rejects = (patch: Record<string, unknown>) => {
    expect(() => parsePack({ ...base, ...patch }, "/tmp/typed.ts")).toThrow(PackError);
    expect(() => parsePack({ ...base, ...patch }, "/tmp/typed.ts")).toThrow(/\/tmp\/typed\.ts/);
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

describe("parsePack sphere eyes", () => {
  const ORIGIN = "/tmp/sphere-pack.ts";
  const EYE = sphereEye;

  const withEyes = (patch: Record<string, unknown>) => spherePack({ eyes: patch });

  /** Puts `first`/`second` in the two eye slots, keeping every other field lawful. */
  const eyePair = (first: Record<string, unknown>, second: Record<string, unknown> = {}) => ({
    eyes: [
      { ...EYE, ...first },
      { ...EYE, lateralDeg: -EYE.lateralDeg, ...second },
    ],
  });

  const rejects = (eyes: Record<string, unknown>, field: RegExp) => {
    const pack = withEyes(eyes);
    expect(() => parsePack(pack, ORIGIN), String(field)).toThrow(PackError);
    expect(() => parsePack(pack, ORIGIN), String(field)).toThrow(ORIGIN);
    expect(() => parsePack(pack, ORIGIN), String(field)).toThrow(field);
  };

  it("accepts a lawful sphere pack", () => {
    expect(parsePack(spherePack(), ORIGIN).id).toBe("organic-blob");
  });

  it("treats absent kind as rect, so old packs still parse", () => {
    expect(parsePack(builtinPacks()[0], "builtin").id).toBe("organic-blob");
  });

  it("rejects an eye kind other than rect or sphere, naming eyes.kind", () => {
    rejects({ kind: "capsule" }, /eyes\.kind/);
  });

  it("rejects a zero sphere radius, naming eyes.sphereRadius", () => {
    expect(() => parsePack(withEyes({ sphereRadius: 0 }), ORIGIN)).toThrow(
      /eyes\.sphereRadius must be a positive number/,
    );
  });

  it("rejects a negative sphere radius", () => {
    rejects({ sphereRadius: -1 }, /eyes\.sphereRadius/);
  });

  it("rejects a non-finite sphere radius", () => {
    rejects({ sphereRadius: Number.NaN }, /eyes\.sphereRadius/);
  });

  it("rejects anything other than two sphere eyes", () => {
    rejects(
      { eyes: [EYE, { ...EYE, lateralDeg: -18 }, EYE] },
      /eyes\.eyes must have exactly 2 entries/,
    );
  });

  it("rejects cull >= fade, naming eyes.cullAtDepth", () => {
    rejects({ cullAtDepth: 0.3, fadeFromDepth: 0.1 }, /eyes\.cullAtDepth/);
  });

  it("rejects a depth threshold outside [0, 1]", () => {
    rejects({ fadeFromDepth: 1.2 }, /eyes\.fadeFromDepth/);
    rejects({ cullAtDepth: -0.1 }, /eyes\.cullAtDepth/);
  });

  it("rejects a body coupling outside [0, 1], naming eyes.bodyCoupling", () => {
    rejects({ bodyCoupling: 3 }, /eyes\.bodyCoupling/);
    rejects({ bodyCoupling: -0.2 }, /eyes\.bodyCoupling/);
  });

  it("rejects a body pitch follow outside [0, 1], naming eyes.bodyPitchFollow", () => {
    rejects({ bodyPitchFollow: 1.5 }, /eyes\.bodyPitchFollow/);
  });

  it("rejects a non-finite optional anchor, naming eyes.anchorY", () => {
    rejects({ anchorY: Number.NaN }, /eyes\.anchorY/);
  });

  it("rejects a non-finite rest tilt, naming eyes.restTiltDeg", () => {
    rejects({ restTiltDeg: Number.POSITIVE_INFINITY }, /eyes\.restTiltDeg/);
  });

  it("rejects a half-width of zero when a size is authored", () => {
    rejects(eyePair({ halfWidth: 0 }), /eyes\.eyes\[0\]\.halfWidth/);
  });

  it("rejects a half-height of zero when a size is authored", () => {
    rejects(eyePair({ halfHeight: 0 }), /eyes\.eyes\[0\]\.halfHeight/);
  });

  it("rejects a 30 degree tilt on a circular eye: it can never be seen", () => {
    rejects(eyePair({ halfWidth: 1, halfHeight: 1, tiltDeg: 30 }), /eyes\.eyes\[0\]\.tiltDeg/);
  });

  it("rejects a sub-20 degree tilt inside the narrow aspect band", () => {
    rejects(eyePair({ halfWidth: 1, halfHeight: 1, tiltDeg: 10 }), /eyes\.eyes\[0\]\.tiltDeg/);
  });

  it("accepts a 30 degree tilt on a long eye, where the tilt is visible", () => {
    const pack = withEyes(eyePair({ tiltDeg: 30 }));
    expect(parsePack(pack, ORIGIN).id).toBe("organic-blob");
  });

  it("accepts zero eye sizes as placeholders that buildGeometry derives", () => {
    // Both shipped sphere packs author 0/0: the real size comes from `deriveFace`.
    const pack = withEyes({
      eyes: [
        { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
        { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
      ],
    });
    expect(parsePack(pack, ORIGIN).id).toBe("organic-blob");
  });

  it("names the second eye when it is the broken one", () => {
    rejects(eyePair({}, { halfHeight: 0 }), /eyes\.eyes\[1\]\.halfHeight/);
  });
});
