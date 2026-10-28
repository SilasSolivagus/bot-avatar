import { describe, expect, it } from "vitest";
import { projectEye } from "../src/eye-projection.js";
import type { Pose } from "../src/geometry.js";
import type { SphereEyeRig } from "../src/geometry.js";

const rig: SphereEyeRig = {
  kind: "sphere",
  sphereRadius: 44,
  splitDeg: 18,
  eyes: [
    { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 0 },
    { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 0 },
  ],
  fadeFromDepth: 0.12,
  cullAtDepth: 0.02,
};

const rest: Pose = { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 };

describe("projectEye", () => {
  it("gives both eyes the same depth when looking straight ahead", () => {
    const left = projectEye(rig, rest, 0);
    const right = projectEye(rig, rest, 1);
    expect(left.depth).toBeCloseTo(right.depth, 6);
  });

  it("narrows the far eye as the gaze turns", () => {
    const width = (yaw: number, index: 0 | 1) => {
      const { matrix } = projectEye(rig, { ...rest, gaze: { yaw, pitch: 0 } }, index);
      return Math.hypot(matrix[0], matrix[1]);
    };
    const restWidth = width(0, 0);
    // 正的 yaw 把注视转向 +x 一侧，1 号眼在那里，成为远眼；负 yaw 时 0 号眼是远眼。
    // 近眼会变宽，只有远眼会变窄，所以断言必须落在远眼上。
    expect(width(25, 1)).toBeLessThan(restWidth * 0.9);
    expect(width(45, 1)).toBeLessThan(width(25, 1));
    expect(width(-25, 0)).toBeLessThan(restWidth * 0.9);
    expect(width(-45, 0)).toBeLessThan(width(-25, 0));
  });

  it("keeps the near eye wider than the far eye when turned", () => {
    const width = (index: 0 | 1) => {
      const { matrix } = projectEye(rig, { ...rest, gaze: { yaw: 30, pitch: 0 } }, index);
      return Math.hypot(matrix[0], matrix[1]);
    };
    expect(Math.max(width(0), width(1)) / Math.min(width(0), width(1))).toBeGreaterThan(1.1);
  });

  it("tilts when looking up or down", () => {
    const straight = projectEye(rig, rest, 0).matrix;
    const up = projectEye(rig, { ...rest, gaze: { yaw: 0, pitch: 20 } }, 0).matrix;
    expect(Math.abs(up[2] - straight[2])).toBeGreaterThan(0.5);
  });

  it("squashes only the vertical axis when the lid closes", () => {
    const open = projectEye(rig, rest, 0).matrix;
    const shut = projectEye(rig, { ...rest, lidOpen: 0.1 }, 0).matrix;
    expect(shut[0]).toBeCloseTo(open[0], 6);
    expect(shut[1]).toBeCloseTo(open[1], 6);
    expect(Math.hypot(shut[2], shut[3])).toBeCloseTo(Math.hypot(open[2], open[3]) * 0.1, 4);
  });

  it("carries the eye's own tilt, mirroring it between the two eyes", () => {
    const tilted: SphereEyeRig = { ...rig, eyes: [{ ...rig.eyes[0], tiltDeg: 12 }, { ...rig.eyes[1], tiltDeg: -12 }] };
    const a = projectEye(tilted, rest, 0).matrix;
    const b = projectEye(tilted, rest, 1).matrix;
    expect(a[2]).not.toBeCloseTo(b[2], 3);
  });

  it("is a pure function of its inputs", () => {
    expect(projectEye(rig, rest, 0)).toEqual(projectEye(rig, rest, 0));
  });
});
