import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { colorIndex, fnv1a } from "../src/color.js";
import { buildAvatarSpec } from "../src/spec.js";

describe("fnv1a", () => {
  it("is a 32-bit unsigned FNV-1a hash", () => {
    expect(fnv1a("")).toBe(2166136261);
    expect(fnv1a("a")).toBe(3826002220);
    expect(fnv1a("bot_123")).toBeGreaterThanOrEqual(0);
    expect(fnv1a("bot_123")).toBeLessThan(2 ** 32);
  });
});

describe("colorIndex", () => {
  it("stays inside the palette", () => {
    for (let index = 0; index < 500; index++) {
      const value = colorIndex(`bot_${index}`, organicBlob.palette.length);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(organicBlob.palette.length);
    }
  });
});

describe("buildAvatarSpec", () => {
  it("derives eye rotation and duration from the seed", () => {
    const spec = buildAvatarSpec(organicBlob, "fixture-0");
    expect(spec.eyeRotation).toBe(2);
    expect(spec.durationMs).toBe(1800);

    const third = buildAvatarSpec(organicBlob, "fixture-3");
    expect(third.eyeRotation).toBe(-4);
    expect(third.durationMs).toBe(2400);
  });

  it("carries the pack identity so a cache key can be built from it", () => {
    const spec = buildAvatarSpec(organicBlob, "bot_123");
    expect(spec.packId).toBe("organic-blob");
    expect(spec.packVersion).toBe("1.0.0");
    expect(spec.viewBox).toBe("-60 -60 120 120");
    expect(spec.identity).toBe("bot_123");
    expect(spec.eyes).toBe(organicBlob.eyes.eyes);
    expect(spec.motionAmplitude).toBe(1);
  });

  it("is deterministic across repeated calls", () => {
    const first = JSON.stringify(buildAvatarSpec(organicBlob, "alice@example.com"));
    const second = JSON.stringify(buildAvatarSpec(organicBlob, "alice@example.com"));
    expect(second).toBe(first);
  });

  it("gives different identities different geometry", () => {
    const a = buildAvatarSpec(organicBlob, "research");
    const b = buildAvatarSpec(organicBlob, "health");
    expect(a.path).not.toBe(b.path);
  });
});
