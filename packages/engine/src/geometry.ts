import type { ClipName } from "./clips.js";
import type { Surface } from "./spec.js";

export type Point = readonly [number, number];

/** 身体：点集 + 变换 + 曲线类型。渲染器据此生成路径。 */
export interface Body {
  outline: ReadonlyArray<Point>;
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

/** v2 的眼睛模型：球面上两只胶囊，按注视角投影。第 2 步才实现渲染。 */
export interface SphereEyeRig {
  kind: "sphere";
  sphereRadius: number;
  splitDeg: number;
  eyes: readonly [
    { lateralDeg: number; verticalDeg: number; halfWidth: number; halfHeight: number; tiltDeg: number },
    { lateralDeg: number; verticalDeg: number; halfWidth: number; halfHeight: number; tiltDeg: number },
  ];
  fadeFromDepth: number;
  cullAtDepth: number;
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
