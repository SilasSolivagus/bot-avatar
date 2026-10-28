import { deriveFace } from "./face.js";
import { toGeometry } from "./geometry-from-spec.js";
import type { AvatarGeometry, SphereEyeRig } from "./geometry.js";
import { buildAvatarSpec } from "./spec.js";
import type { StylePack } from "./spec.js";

/**
 * v2 入口：由 pack + 身份直接得到几何。
 * `rect` 眼睛的包走 v1 适配器，输出与 renderSvg 完全一致；
 * `sphere` 眼睛的包构造球面 rig，由渲染器按注视角投影。
 *
 * A sphere pack is geometry-only: `renderSvg` cannot take one, because
 * `AvatarSpec.eyes` holds rects. `buildGeometry` is its entry point — do not try
 * `buildAvatarSpec` on an orb pack, whose eye block has no v1 `rotation`.
 */
export function buildGeometry(pack: StylePack, identity: string): AvatarGeometry {
  // v1 的 `EyeGeometry` 还没有球面成员，所以这里用一次 cast 读 `kind`。
  // 收窄 v1 类型会牵动所有现有 pack 与校验，属于阶段 B 之后的事（R56）。
  const eyeBlock = pack.eyes as unknown as { kind?: string };
  if (eyeBlock.kind !== "sphere") {
    return toGeometry(pack, buildAvatarSpec(pack, identity));
  }

  const rig = pack.eyes as unknown as SphereEyeRig;
  // v1 适配器会读 `eyes.rotation`，而球面包不携带 v1 的矩形眼与 rotation；它产出
  // 的眼睛会在下面被整个替换，所以喂给它一组中性的 v1 眼睛，而不是让它去读不存在的字段。
  const v1Pack: StylePack = {
    ...pack,
    eyes: { eyes: [], rotation: { modulo: 1, spread: 0 } },
  };
  const geometry = toGeometry(v1Pack, buildAvatarSpec(v1Pack, identity));

  // For a sphere rig the eye size, spacing and anchor are a property of the body
  // outline, not of the pack: `deriveFace` measures the shape and decides. Values
  // declared in the pack's eye block (`lateralDeg`, `halfWidth`, `halfHeight`,
  // `tiltDeg`) are therefore ignored for sphere rigs — a pack only chooses the
  // sphere radius, the depth band and the coupling.
  const face = deriveFace(geometry.body.outline, { sphereRadius: rig.sphereRadius });
  const restTiltDeg = Number.isFinite(rig.restTiltDeg) ? rig.restTiltDeg! : 0;
  const bodyPitchFollow = Number.isFinite(rig.bodyPitchFollow) ? rig.bodyPitchFollow! : 0;

  const derived = rig.eyes.map((eye, index) => ({
    ...eye,
    // Positive `lateralDeg` lands on screen's −x side (the projection mirrors it),
    // so eye 0 is +split and eye 1 is −split: the pair opens symmetrically.
    lateralDeg: index === 0 ? face.splitDeg : -face.splitDeg,
    halfWidth: face.halfWidth,
    halfHeight: face.halfHeight,
    // Rest tilt is the same direction on both eyes: parallel, never mirrored.
    tiltDeg: restTiltDeg,
  })) as unknown as SphereEyeRig["eyes"];

  return {
    ...geometry,
    rig: {
      kind: "sphere",
      sphereRadius: rig.sphereRadius,
      eyes: derived,
      fadeFromDepth: rig.fadeFromDepth,
      cullAtDepth: rig.cullAtDepth,
      bodyCoupling: rig.bodyCoupling,
      bodyPitchFollow,
      restTiltDeg,
      anchorY: face.dy,
    },
    pose: { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 },
  };
}
