import { describe, expect, it } from "vitest";
import { buildAvatarSpec, buildGeometry, projectEye, radiusAtAngle } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderGeometry, renderSvg } from "@botavatar/svg";
import { clay } from "../src/packs/clay.js";
import { orb } from "../src/packs/orb.js";
import { poseGeometry, gazeFromPointer } from "../src/pose.js";

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
      // The head now takes 35% of the pitch, so the eyes see 13° of the 20 and lean
      // less than they did before the coupling; the sign is still unmistakable.
      expect(Math.abs(tiltUp)).toBeGreaterThan(2);
      expect(Math.abs(tiltDown)).toBeGreaterThan(2);
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
      // The projection carries the pitch the head does not take (65% for the orb),
      // so the eye centres still follow the gaze up/down, and the capsule length
      // foreshortens as its axis leaves the screen plane. The y axis is the
      // viewBox's, pointing down.
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

describe("pointer follow: the head and the eyes share one gaze", () => {
  /** A square card centred at (200, 200); its top-left corner is (100, 100). */
  const CARD = { left: 100, top: 100, width: 200, height: 200 };

  it("turns and nods the head by the pack's share at the top-left corner", () => {
    const geometry = buildGeometry(orb, "alice");
    const followed = renderGeometry(
      poseGeometry(geometry, { gaze: gazeFromPointer(100, 100, CARD), lidOpen: 1 }),
      { size: 160 },
    );
    // Head: 35% of −45° = −15.75°; nod: −25° × 0.35 × 0.6 = −5.25 viewBox units up.
    expect(followed).toContain('<g transform="translate(0,-5.25)"><g transform="rotate(-15.75)">');
  });

  it("gives the eyes exactly the remainder of the turn and the pitch", () => {
    const geometry = buildGeometry(orb, "alice");
    if (geometry.rig.kind !== "sphere") throw new Error("orb is a sphere pack");
    const corner = gazeFromPointer(100, 100, CARD);
    const followed = renderGeometry(
      poseGeometry(geometry, { gaze: corner, lidOpen: 1 }),
      { size: 160 },
    );
    // Render the same gaze with the head taking nothing: if the split is total, the
    // eyes must be drawn at the same size and angle in both cases.
    const eyeOnly = {
      ...geometry,
      rig: { ...geometry.rig, bodyCoupling: 0, bodyPitchFollow: 0 },
    };
    const remainder = {
      yaw: corner.yaw * (1 - geometry.rig.bodyCoupling),
      pitch: corner.pitch * (1 - (geometry.rig.bodyPitchFollow ?? 0)),
    };
    const eyeOnlySvg = renderGeometry(
      poseGeometry(eyeOnly, { gaze: remainder, lidOpen: 1 }),
      { size: 160 },
    );
    const a = capsules(followed);
    const b = capsules(eyeOnlySvg);
    expect(a).toHaveLength(2);
    for (const index of [0, 1] as const) {
      expect(a[index]!.width).toBeCloseTo(b[index]!.width, 6);
      expect(a[index]!.height).toBeCloseTo(b[index]!.height, 6);
      expect(angleDelta(a[index]!.angle, b[index]!.angle)).toBeCloseTo(0, 5);
    }
  });

  it("keeps every capsule inside the silhouette at the four corners", () => {
    const geometry = buildGeometry(orb, "wall-0-0");
    for (const [yaw, pitch] of [
      [-44, 25],
      [45, 25],
      [-44, -25],
      [45, -25],
    ] as const) {
      const drawn = capsules(
        renderGeometry(poseGeometry(geometry, { gaze: { yaw, pitch }, lidOpen: 1 }), {
          size: 160,
        }),
      );
      expect(drawn).toHaveLength(2);
      for (const capsule of drawn) {
        const angle = Math.atan2(capsule.cy, capsule.cx);
        const outer =
          Math.hypot(capsule.cx, capsule.cy) + Math.max(capsule.width, capsule.height) / 2;
        // The capsule's bounding circle must stay inside the outline at its own
        // angle. 0.5 absorbs the emitted 3-decimal rounding.
        expect(outer).toBeLessThanOrEqual(radiusAtAngle(geometry.body.outline, angle) + 0.5);
      }
    }
  });

  it("pulls in the eye that would escape the cloud at the top-left", () => {
    const geometry = buildGeometry(orb, "wall-0-0");
    if (geometry.rig.kind !== "sphere") throw new Error("orb is a sphere pack");
    const gaze = { yaw: -44, pitch: 25 };
    const eyePose = {
      gaze: {
        yaw: gaze.yaw * (1 - geometry.rig.bodyCoupling),
        pitch: gaze.pitch * (1 - (geometry.rig.bodyPitchFollow ?? 0)),
      },
      lidOpen: 1,
    };
    const raw = projectEye(geometry.rig, eyePose, 0);
    const anchor = geometry.rig.anchorY ?? 0;
    // Where the far capsule would sit with no fit: its centre plus the face anchor.
    const rawDistance = Math.hypot(raw.matrix[4], raw.matrix[5] + anchor);
    const drawn = capsules(
      renderGeometry(poseGeometry(geometry, { gaze, lidOpen: 1 }), { size: 160 }),
    )[0]!;
    const drawnDistance = Math.hypot(drawn.cx, drawn.cy);
    expect(drawnDistance).toBeLessThan(rawDistance);
    // And it is now at the room, not merely closer.
    const radius = radiusAtAngle(geometry.body.outline, Math.atan2(drawn.cy, drawn.cx));
    const room = radius - Math.max(drawn.width, drawn.height) / 2 - 2.5;
    expect(drawnDistance).toBeCloseTo(room, 1);
  });

  it("returns to the rest pose when the pointer leaves", () => {
    // The card clears its follow state on pointerleave; at the renderer level that is
    // the sliders' pose: no head wrapper, no nod, both eyes symmetric.
    const geometry = buildGeometry(orb, "alice");
    const rest = renderGeometry(geometry, { size: 160 });
    expect(rest).not.toContain('<g transform="translate(0,');
    expect(rest).not.toMatch(/<g transform="rotate\(/);
    expect(capsules(rest)).toHaveLength(2);
  });
});
