import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { buildAvatarSpec } from "../src/spec.js";
import { outlinePath, phaseForSeed } from "../src/outline.js";
import { toGeometry } from "../src/geometry-from-spec.js";
import { fixtureRows } from "./helpers.js";

describe("toGeometry", () => {
  it("describes the same body the spec was built from", () => {
    for (const row of fixtureRows.slice(0, 12)) {
      const spec = buildAvatarSpec(organicBlob, row.identity);
      const geometry = toGeometry(organicBlob, spec);
      expect(geometry.body.outline).toEqual(organicBlob.shapes[spec.family]!.outline);
      expect(geometry.body.phase).toBe(phaseForSeed(spec.seed));
      expect(geometry.body.smoothingPasses).toBe(organicBlob.shapes[spec.family]!.smoothingPasses);
      expect(geometry.body.curve).toBe("smooth");
      expect(geometry.body.viewBox).toBe(organicBlob.viewBox);
    }
  });

  it("reproduces the spec's path exactly from the geometry alone", () => {
    for (const row of fixtureRows.slice(0, 12)) {
      const spec = buildAvatarSpec(organicBlob, row.identity);
      const geometry = toGeometry(organicBlob, spec);
      const rebuilt = outlinePath(geometry.body.outline, {
        phase: geometry.body.phase,
        smoothingPasses: geometry.body.smoothingPasses,
      });
      expect(rebuilt).toBe(spec.path);
      expect(rebuilt).toBe(row.path);
    }
  });

  it("carries the legacy eye rig unchanged", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    const geometry = toGeometry(organicBlob, spec);
    expect(geometry.rig.kind).toBe("rect");
    if (geometry.rig.kind !== "rect") throw new Error("unreachable");
    expect(geometry.rig.eyes).toEqual(organicBlob.eyes.eyes);
    expect(geometry.rig.rotationDeg).toBe(spec.eyeRotation);
  });

  it("carries identity, palette and motion", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    const geometry = toGeometry(organicBlob, spec);
    expect(geometry.seed).toBe(spec.seed);
    expect(geometry.family).toBe(spec.family);
    expect(geometry.look).toBe(spec.look);
    expect(geometry.ink.body).toBe(spec.color.light);
    expect(geometry.ink.bodyHighlight).toBe(spec.color.dark);
    expect(geometry.ink.eyes).toBe(spec.color.eye);
    expect(geometry.ink.bodyId).toBe(spec.color.id);
    expect(geometry.ink.bodyName).toBe(spec.color.name);
    expect(geometry.durationMs).toBe(spec.durationMs);
    expect(geometry.clip).toBe(spec.clip);
    expect(geometry.pose).toEqual({ gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 });
  });

  it("is a pure function of its inputs", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    expect(toGeometry(organicBlob, spec)).toEqual(toGeometry(organicBlob, spec));
  });
});
