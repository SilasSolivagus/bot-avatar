import { describe, expect, it } from "vitest";
import { buildAvatarSpec, buildGeometry } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderGeometry, renderSvg } from "@botavatar/svg";
import { clay } from "../src/packs/clay.js";
import { orb } from "../src/packs/orb.js";
import { poseGeometry } from "../src/pose.js";

const IDENTITIES = ["alice", "bot_123", "wall-3-0", "research"];

type Matrix = readonly [number, number, number, number, number, number];

/**
 * The sphere branch draws each capsule with its own projection matrix and no other
 * transform, so pulling the matrices out is the same as reading the two eyes.
 */
function capsuleMatrices(svg: string): Matrix[] {
  return [...svg.matchAll(/transform="matrix\(([^)]+)\)"/g)].map((match) => {
    const [a, b, c, d, e, f] = match[1]!.trim().split(/\s+/).map(Number);
    return [a!, b!, c!, d!, e!, f!] as const;
  });
}

// The matrix carries the capsule's half-extents, and the rect it draws is a unit
// capsule, so the drawn size is twice a matrix column.
const capsuleWidth = (matrix: Matrix): number => 2 * Math.hypot(matrix[0], matrix[1]);
const capsuleHeight = (matrix: Matrix): number => 2 * Math.hypot(matrix[2], matrix[3]);
const axisAngle = (matrix: Matrix): number => (Math.atan2(matrix[3], matrix[2]) * 180) / Math.PI;
const bodyPath = (svg: string): string => /<path d="([^"]+)"/.exec(svg)?.[1] ?? "";

/** The gallery renders every pack through `buildGeometry` + `renderGeometry` now. */
const galleryRender = (pack: Parameters<typeof buildGeometry>[0], identity: string, size = 160) =>
  renderGeometry(buildGeometry(pack, identity), { size });

describe("the gallery's single rendering path", () => {
  it("renders every rect pack through geometry exactly as renderSvg renders its spec", () => {
    for (const pack of [organicBlob, clay]) {
      for (const identity of IDENTITIES) {
        for (const size of [48, 160]) {
          for (const state of ["idle", "working"] as const) {
            expect(renderGeometry(buildGeometry(pack, identity), { size, state })).toBe(
              renderSvg(buildAvatarSpec(pack, identity), { size, state }),
            );
          }
        }
      }
    }
  });
});

describe("the orb pack through the geometry path", () => {
  it("starts at rest with two equally wide, open capsules", () => {
    const geometry = buildGeometry(orb, "alice");
    expect(geometry.rig.kind).toBe("sphere");
    const matrices = capsuleMatrices(renderGeometry(geometry, { size: 160 }));
    expect(matrices).toHaveLength(2);
    expect(capsuleWidth(matrices[0]!)).toBeCloseTo(capsuleWidth(matrices[1]!), 6);
    // At rest the drawn capsule is 2·halfWidth across — foreshortened by the eye's
    // lateral angle, so 8.4·cos18° ≈ 7.99 — and 2·halfHeight long: the same 8 × 25
    // as organic-blob's 7 × 24 rect eyes, inside a 120 viewBox.
    expect(capsuleWidth(matrices[0]!)).toBeCloseTo(7.994, 2);
    expect(capsuleHeight(matrices[0]!)).toBeCloseTo(25, 1);
    expect(capsuleHeight(matrices[1]!)).toBeCloseTo(25, 1);
  });

  it("narrows the far eye at +40 yaw and mirrors it at -40", () => {
    const geometry = buildGeometry(orb, "alice");
    const widths = (yaw: number) =>
      capsuleMatrices(
        renderGeometry(poseGeometry(geometry, { gaze: { yaw, pitch: 0 }, lidOpen: 1 }), {
          size: 160,
        }),
      ).map(capsuleWidth);
    const rest = widths(0);
    const right = widths(40);
    const left = widths(-40);
    // Eye 1 sits at lateral -18: it is the far one when the gaze goes to +yaw.
    expect(right[1]!).toBeLessThan(right[0]!);
    expect(left[0]!).toBeLessThan(left[1]!);
    // The far eye narrows hard; the near eye keeps almost all of its width.
    expect(right[1]! / rest[1]!).toBeLessThan(0.65);
    expect(right[0]! / rest[0]!).toBeGreaterThan(0.85);
    expect(left[0]! / rest[0]!).toBeLessThan(0.65);
    expect(left[1]! / rest[1]!).toBeGreaterThan(0.85);
  });

  it("tilts both eyes the other way at +20 and -20 pitch", () => {
    const geometry = buildGeometry(orb, "alice");
    const angles = (pitch: number) =>
      capsuleMatrices(
        renderGeometry(poseGeometry(geometry, { gaze: { yaw: 0, pitch }, lidOpen: 1 }), {
          size: 160,
        }),
      ).map(axisAngle);
    const rest = angles(0);
    const up = angles(20);
    const down = angles(-20);
    for (const index of [0, 1] as const) {
      const tiltUp = up[index]! - rest[index]!;
      const tiltDown = down[index]! - rest[index]!;
      expect(Math.abs(tiltUp)).toBeGreaterThan(5);
      expect(Math.abs(tiltDown)).toBeGreaterThan(5);
      expect(Math.sign(tiltUp)).toBe(-Math.sign(tiltDown));
    }
  });

  it("squashes both eyes on blink without touching the body", () => {
    const geometry = buildGeometry(orb, "alice");
    const rest = renderGeometry(geometry, { size: 160 });
    const blink = renderGeometry(
      poseGeometry(geometry, { gaze: { yaw: 0, pitch: 0 }, lidOpen: 0.1 }),
      { size: 160 },
    );
    const restMatrices = capsuleMatrices(rest);
    const blinkMatrices = capsuleMatrices(blink);
    expect(blinkMatrices).toHaveLength(2);
    for (const index of [0, 1] as const) {
      // Matrices are emitted with 3 decimals, so the ratio is close, not exact.
      expect(capsuleHeight(blinkMatrices[index]!)).toBeCloseTo(
        capsuleHeight(restMatrices[index]!) * 0.1,
        2,
      );
      expect(capsuleWidth(blinkMatrices[index]!)).toBeCloseTo(
        capsuleWidth(restMatrices[index]!),
        6,
      );
    }
    expect(bodyPath(blink)).toBe(bodyPath(rest));
    expect(bodyPath(blink)).not.toBe("");
  });

  it("keeps the body and gradient identical while the gaze moves", () => {
    const geometry = buildGeometry(orb, "alice");
    const rest = galleryRender(orb, "alice");
    const yawed = renderGeometry(
      poseGeometry(geometry, { gaze: { yaw: 40, pitch: 20 }, lidOpen: 1 }),
      { size: 160 },
    );
    expect(bodyPath(yawed)).toBe(bodyPath(rest));
    expect(/<linearGradient[\s\S]*?<\/linearGradient>/.exec(yawed)?.[0]).toBe(
      /<linearGradient[\s\S]*?<\/linearGradient>/.exec(rest)?.[0],
    );
  });
});
