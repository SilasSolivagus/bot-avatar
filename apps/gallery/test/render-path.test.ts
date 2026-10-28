import { describe, expect, it } from "vitest";
import { buildAvatarSpec, buildGeometry } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderGeometry, renderSvg } from "@botavatar/svg";
import { clay } from "../src/packs/clay.js";
import { orb } from "../src/packs/orb.js";
import { poseGeometry } from "../src/pose.js";

const IDENTITIES = ["alice", "bot_123", "wall-3-0", "research"];

interface Capsule {
  cx: number;
  cy: number;
  angle: number;
  width: number;
  height: number;
  rx: number;
}

/**
 * The sphere branch draws each capsule as a local-coordinate rect inside a
 * `translate(...) rotate(...)` group, so pulling those groups out is the same as
 * reading the two eyes.
 */
function capsules(svg: string): Capsule[] {
  return [
    ...svg.matchAll(
      /<g transform="translate\(([^,]+),([^)]+)\) rotate\(([^)]+)\)"><rect ([^>]*?)\s*\/><\/g>/g,
    ),
  ].map((match) => {
    const rect = match[4]!;
    const number = (name: string) =>
      Number(new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(rect)?.[1] ?? "");
    return {
      cx: Number(match[1]),
      cy: Number(match[2]),
      angle: Number(match[3]),
      width: number("width"),
      height: number("height"),
      rx: number("rx"),
    };
  });
}

// The projection is decomposed into the capsule's own half-extents, so the drawn size
// is exactly the rect's width and height.
const capsuleWidth = (capsule: Capsule): number => capsule.width;
const capsuleHeight = (capsule: Capsule): number => capsule.height;
/** Angular difference in (−180, 180], so a wrap around ±180° does not read as a jump. */
const angleDelta = (value: number, from: number): number => {
  let delta = value - from;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
};
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
    if (geometry.rig.kind !== "sphere") throw new Error("unreachable");
    const drawn = capsules(renderGeometry(geometry, { size: 160 }));
    expect(drawn).toHaveLength(2);
    expect(capsuleWidth(drawn[0]!)).toBeCloseTo(capsuleWidth(drawn[1]!), 6);
    // `rx` is half the width on every capsule: rounded ends, never a squashed ellipse.
    for (const capsule of drawn) {
      expect(capsule.rx).toBeCloseTo(capsule.width / 2, 6);
    }
    // The size is derived from organic-blob's outline, not declared by the pack: at
    // rest the capsule is 2·halfWidth across (foreshortened by its lateral angle) and
    // 2·halfHeight long, inside the 120 viewBox.
    const eye = geometry.rig.eyes[0];
    const lateral = (Math.abs(eye.lateralDeg) * Math.PI) / 180;
    expect(capsuleWidth(drawn[0]!)).toBeCloseTo(2 * eye.halfWidth * Math.cos(lateral), 1);
    expect(capsuleHeight(drawn[0]!)).toBeCloseTo(2 * eye.halfHeight, 1);
    expect(capsuleHeight(drawn[1]!)).toBeCloseTo(2 * eye.halfHeight, 1);
  });

  it("narrows the far eye at +40 yaw and mirrors it at -40", () => {
    const geometry = buildGeometry(orb, "alice");
    const widths = (yaw: number) =>
      capsules(
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
    // The pack couples 35% of the turn to the body, so the eyes see 26° of the 40:
    // the far eye keeps most but not all of its width, and the near eye gains a little.
    expect(right[1]! / rest[1]!).toBeLessThan(0.8);
    expect(right[0]! / rest[0]!).toBeGreaterThan(1);
    expect(left[0]! / rest[0]!).toBeLessThan(0.8);
    expect(left[1]! / rest[1]!).toBeGreaterThan(1);
  });

  it("turns the body by the pack's coupling, and not at all at rest", () => {
    const geometry = buildGeometry(orb, "alice");
    // The eyes always carry a rotate group of their own; only a head wrapper starts
    // with `rotate(` directly.
    expect(renderGeometry(geometry, { size: 160 })).not.toMatch(/<g transform="rotate\(/);
    const turned = renderGeometry(
      poseGeometry(geometry, { gaze: { yaw: 40, pitch: 0 }, lidOpen: 1 }),
      { size: 160 },
    );
    // 35% of 40 is 14: this is the field that makes the slider read as a head turn.
    expect(turned).toContain('<g transform="rotate(14)">');
  });

  it("tilts both eyes the other way at +20 and -20 pitch", () => {
    const geometry = buildGeometry(orb, "alice");
    const angles = (pitch: number) =>
      capsules(
        renderGeometry(poseGeometry(geometry, { gaze: { yaw: 0, pitch }, lidOpen: 1 }), {
          size: 160,
        }),
      ).map((capsule) => capsule.angle);
    const rest = angles(0);
    const up = angles(20);
    const down = angles(-20);
    for (const index of [0, 1] as const) {
      const tiltUp = angleDelta(up[index]!, rest[index]!);
      const tiltDown = angleDelta(down[index]!, rest[index]!);
      expect(Math.abs(tiltUp)).toBeGreaterThan(5);
      expect(Math.abs(tiltDown)).toBeGreaterThan(5);
      expect(Math.sign(tiltUp)).toBe(-Math.sign(tiltDown));
    }
  });

  it("lifts both eyes and foreshortens them when the gaze pitches", () => {
    const geometry = buildGeometry(orb, "alice");
    const drawn = (pitch: number) =>
      capsules(
        renderGeometry(poseGeometry(geometry, { gaze: { yaw: 0, pitch }, lidOpen: 1 }), {
          size: 160,
        }),
      );
    const rest = drawn(0);
    const up = drawn(20);
    const down = drawn(-20);
    for (const index of [0, 1] as const) {
      // The projection carries the remaining pitch (this pack gives none to the head):
      // the eye centres follow the gaze up/down, and the capsule length foreshortens
      // as its axis leaves the screen plane. The y axis is the viewBox's, pointing down.
      expect(up[index]!.cy).toBeLessThan(rest[index]!.cy);
      expect(down[index]!.cy).toBeGreaterThan(rest[index]!.cy);
      expect(capsuleHeight(up[index]!)).toBeLessThan(capsuleHeight(rest[index]!));
      expect(capsuleHeight(down[index]!)).toBeLessThan(capsuleHeight(rest[index]!));
      expect(Number.isNaN(up[index]!.angle)).toBe(false);
    }
  });

  it("squashes both eyes on blink without touching the body", () => {
    const geometry = buildGeometry(orb, "alice");
    const rest = renderGeometry(geometry, { size: 160 });
    const blink = renderGeometry(
      poseGeometry(geometry, { gaze: { yaw: 0, pitch: 0 }, lidOpen: 0.1 }),
      { size: 160 },
    );
    const restCapsules = capsules(rest);
    const blinkCapsules = capsules(blink);
    expect(blinkCapsules).toHaveLength(2);
    for (const index of [0, 1] as const) {
      // Sizes are emitted with 3 decimals, so the ratio is close, not exact.
      expect(capsuleHeight(blinkCapsules[index]!)).toBeCloseTo(
        capsuleHeight(restCapsules[index]!) * 0.1,
        2,
      );
      expect(capsuleWidth(blinkCapsules[index]!)).toBeCloseTo(
        capsuleWidth(restCapsules[index]!),
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
