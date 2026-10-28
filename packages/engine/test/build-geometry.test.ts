import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { buildGeometry } from "../src/build-geometry.js";
import { deriveFace } from "../src/face.js";
import { toGeometry } from "../src/geometry-from-spec.js";
import { buildAvatarSpec } from "../src/spec.js";
import type { StylePack } from "../src/spec.js";

/**
 * The plan's orb pack: organic-blob's shapes and palette, sphere eyes.
 * It deliberately carries no v1 `rotation`, because a sphere pack has no rect eyes.
 */
const spherePack = {
  ...organicBlob,
  id: "orb",
  name: "Orb",
  version: "0.1.0",
  eyes: {
    kind: "sphere",
    sphereRadius: 44,
    eyes: [
      { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: -6 },
      { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 6 },
    ],
    fadeFromDepth: 0.12,
    cullAtDepth: 0.02,
    bodyCoupling: 0.35,
    bodyPitchFollow: 0.35,
    restTiltDeg: -4,
  },
} as unknown as StylePack;

describe("buildGeometry", () => {
  it("matches the spec adapter for a rect pack", () => {
    for (const identity of ["alice", "bob", "wall-3-0"]) {
      expect(buildGeometry(organicBlob, identity)).toEqual(
        toGeometry(organicBlob, buildAvatarSpec(organicBlob, identity)),
      );
    }
  });

  it("builds a sphere rig for a sphere pack", () => {
    const geometry = buildGeometry(spherePack, "alice");
    expect(geometry.rig.kind).toBe("sphere");
    if (geometry.rig.kind !== "sphere") throw new Error("unreachable");
    expect(geometry.rig.sphereRadius).toBe(44);
    expect(geometry.rig.eyes).toHaveLength(2);
    expect(geometry.rig.fadeFromDepth).toBe(0.12);
    expect(geometry.rig.cullAtDepth).toBe(0.02);
    expect(geometry.rig.bodyCoupling).toBe(0.35);
    expect(geometry.rig.bodyPitchFollow).toBe(0.35);
    expect(geometry.rig.restTiltDeg).toBe(-4);
  });

  it("derives the sphere eyes from the outline, ignoring the pack's declared values", () => {
    const geometry = buildGeometry(spherePack, "alice");
    if (geometry.rig.kind !== "sphere") throw new Error("unreachable");
    const face = deriveFace(geometry.body.outline);
    expect(geometry.rig.anchorY).toBe(face.dy);
    expect(geometry.rig.eyes[0]).toMatchObject({
      lateralDeg: face.splitDeg,
      halfWidth: face.halfWidth,
      halfHeight: face.halfHeight,
      tiltDeg: -4,
    });
    expect(geometry.rig.eyes[1]).toMatchObject({
      lateralDeg: -face.splitDeg,
      halfWidth: face.halfWidth,
      halfHeight: face.halfHeight,
      tiltDeg: -4,
    });
    // Parallel, not mirrored: both eyes lean the same way at rest.
    expect(geometry.rig.eyes[0]!.tiltDeg).toBe(geometry.rig.eyes[1]!.tiltDeg);
    // The pack declared 4.2 / 12.5 / ±18 / mirrored tilts; none of that survives.
    expect(geometry.rig.eyes[0]!.halfWidth).not.toBe(4.2);
    expect(geometry.rig.eyes[0]!.halfHeight).not.toBe(12.5);
  });

  it("starts a sphere rig at rest, so the first frame is a straight gaze", () => {
    const geometry = buildGeometry(spherePack, "alice");
    expect(geometry.pose).toEqual({ gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 });
  });

  it("keeps identity-derived fields identical across both paths", () => {
    const rect = buildGeometry(organicBlob, "alice");
    const sphere = buildGeometry(spherePack, "alice");
    expect(sphere.seed).toBe(rect.seed);
    expect(sphere.family).toBe(rect.family);
    expect(sphere.look).toBe(rect.look);
    expect(sphere.body.outline).toEqual(rect.body.outline);
    expect(sphere.ink).toEqual(rect.ink);
    expect(sphere.clip).toBe(rect.clip);
    expect(sphere.durationMs).toBe(rect.durationMs);
    expect(sphere.body.viewBox).toBe(rect.body.viewBox);
    expect(sphere.packId).toBe("orb");
  });

  it("is deterministic", () => {
    expect(buildGeometry(spherePack, "alice")).toEqual(buildGeometry(spherePack, "alice"));
  });
});
