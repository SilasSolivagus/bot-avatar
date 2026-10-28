import { toGeometry } from "./geometry-from-spec.js";
import type { AvatarGeometry, EyeRig } from "./geometry.js";
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

  const rig = pack.eyes as unknown as Extract<EyeRig, { kind: "sphere" }>;
  // v1 适配器会读 `eyes.rotation`，而球面包不携带 v1 的矩形眼与 rotation；它产出
  // 的眼睛会在下面被整个替换，所以喂给它一组中性的 v1 眼睛，而不是让它去读不存在的字段。
  const v1Pack: StylePack = {
    ...pack,
    eyes: { eyes: [], rotation: { modulo: 1, spread: 0 } },
  };
  return {
    ...toGeometry(v1Pack, buildAvatarSpec(v1Pack, identity)),
    rig: {
      kind: "sphere",
      sphereRadius: rig.sphereRadius,
      eyes: rig.eyes,
      fadeFromDepth: rig.fadeFromDepth,
      cullAtDepth: rig.cullAtDepth,
    },
    pose: { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 },
  };
}
