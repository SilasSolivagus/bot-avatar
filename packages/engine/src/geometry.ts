import type { ClipName } from "./clips.js";
import type { Surface } from "./spec.js";

export type Point = readonly [number, number];

/** 身体：点集 + 变换 + 曲线类型。渲染器据此生成路径。 */
export interface Body {
  /** 多边形视图；`radii` 剖面也会派生一份，供尚未切换的消费者使用。 */
  outline: ReadonlyArray<Point>;
  /**
   * 64 个等角度半径——形状的权威表示。存在时 `outline` 是 `radiiToPoints` 派生出来的
   * 多边形视图，渲染器应优先走 `radiiToPath` / `radiusAtRadii`。
   */
  radii?: readonly number[];
  /** 由身份哈希决定的形变相位（弧度） */
  phase: number;
  smoothingPasses: number;
  curve: "smooth" | "hard";
  viewBox: string;
}

/** v1 的眼睛模型：两组矩形/椭圆 + 整组旋转。保留它是为了让老 pack 输出不变。 */
export interface RectEyeRig {
  kind: "rect";
  eyes: ReadonlyArray<
    | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
    | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  >;
  rotationDeg: number;
}

/**
 * v2 的眼睛模型：球面上两只胶囊，按注视角投影。
 * 分开量只由每只眼睛自己的 `lateralDeg` 表达，不再有整组的 `splitDeg`。
 */
export interface SphereEyeRig {
  kind: "sphere";
  /**
   * What the capsules are filled with. `"ink"` (the default) is the palette's eye
   * colour, so existing packs keep their bytes. `"surface"` fills each capsule with
   * the host surface's colour and strokes it in the same colour, which makes the eye
   * read as a cut-out while the avatar stays opaque
   * (`docs/design/2026-10-28-eye-cutout.md`). The surface colour is a render option,
   * not pack data: the caller knows what it is painting on.
   */
  eyePaint?: "surface" | "ink";
  sphereRadius: number;
  eyes: readonly [
    { lateralDeg: number; verticalDeg: number; halfWidth: number; halfHeight: number; tiltDeg: number },
    { lateralDeg: number; verticalDeg: number; halfWidth: number; halfHeight: number; tiltDeg: number },
  ];
  fadeFromDepth: number;
  cullAtDepth: number;
  /**
   * 注视转动里由"头"承担的比例，0–1。0 是只动眼睛（v1 观感），1 是只转头。
   * 渲染器把总 yaw 拆成两半：group 转 `yaw × coupling`，投影用 `yaw × (1 − coupling)`。
   * 只转 group 而不降投影 yaw 会让眼睛相对脸多转一遍。
   */
  bodyCoupling: number;
  /**
   * 俯仰分给头部的比例，0–1；与 {@link bodyCoupling} 对称。
   * 渲染器把头的竖直位移写成 `−pitch × bodyPitchFollow × 0.6`，投影只用剩下的
   * `pitch × (1 − bodyPitchFollow)`，总量守恒。缺省按 0 处理，老 pack 因此不变。
   */
  bodyPitchFollow?: number;
  /**
   * 眼睛的静止倾斜（度，同向、不镜像）。由 `buildGeometry` 写进两只眼睛的
   * `tiltDeg`；镜像倾斜只留给表情，不作为静止形态。
   */
  restTiltDeg?: number;
  /**
   * 眼睛组的竖直锚点偏移（viewBox 单位），由轮廓推导。脸不一定在包围盒中心，
   * 渲染器把它加到投影中心的 y 上。缺省按 0 处理。
   */
  anchorY?: number;
}

export type EyeRig = RectEyeRig | SphereEyeRig;

export interface Pose {
  /** 绝对注视方向，度；v1 没有这个概念，适配器填 0 */
  gaze: { yaw: number; pitch: number };
  /** 1 全开，0 全闭 */
  lidOpen: number;
}

export interface Ink {
  /** 具体颜色由渲染器解析；v1 适配器直接把 pack 的颜色填进来 */
  body: string;
  /** 眼睛颜色；v1 是实心色，v2 的球面模型可以换成 "surface" */
  eyes: string;
  bodyHighlight: string;
  /**
   * 调色板条目的 id，原样带过来。渲染器生成渐变元素 id 时会用到它，
   * 让几何自己就能复现今天的输出，而不必回头去猜颜色身份。
   */
  bodyId: string;
  /** 调色板条目的名称，原样带过来；理由同 {@link bodyId}。 */
  bodyName: string;
}

export interface AvatarGeometry {
  packId: string;
  packVersion: string;
  identity: string;
  seed: number;
  family: number;
  look: number;
  body: Body;
  rig: EyeRig;
  pose: Pose;
  ink: Ink;
  /**
   * 材质词汇：渐变 stops、高光、阴影、纹理。v1 的 spec.surface 原样带过来；
   * 渲染器读的就是 spec.surface，所以几何必须携带它，材质包才自足。
   */
  surface?: Surface;
  /** 循环时长，毫秒；v1 的 durationMs */
  durationMs: number;
  motionAmplitude: number;
  /**
   * 该 family 播放的循环，v1 的 clip。渲染器的工作态关键帧只由它决定，
   * 而它无法从其它几何字段推出，所以必须随几何一起带过来。
   */
  clip: ClipName;
  /** v1 的可见性：本步不填，留给后续步骤 */
  accessories?: ReadonlyArray<unknown>;
}
