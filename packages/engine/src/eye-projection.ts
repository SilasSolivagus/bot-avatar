import type { Pose, SphereEyeRig } from "./geometry.js";

export interface ProjectedEye {
  /** SVG matrix(a b c d e f) */
  matrix: readonly [number, number, number, number, number, number];
  depth: number;
}

type Vec3 = readonly [number, number, number];

const norm = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const deg = (value: number): number => (value * Math.PI) / 180;

/**
 * 俯仰上界。到 90° 时 `cross([0, -1, 0], forward)` 退化为零向量，切平面基不存在，
 * 矩阵会塌缩；钳制在 80° 让函数对任意输入都有确定输出。
 */
const MAX_PITCH_DEG = 80;

/**
 * 一只眼睛在球面上的正交投影。坐标系为 y 向下（与 viewBox 一致）。
 *
 * 顺序固定：切平面基向量 → 单眼倾斜 → 眨眼竖直压扁。反了的话，
 * 眨眼会沿胶囊长轴发生，看起来像变窄而不是闭上。
 */
export function projectEye(rig: SphereEyeRig, pose: Pose, index: 0 | 1): ProjectedEye {
  const yaw = deg(pose.gaze.yaw);
  const pitch = deg(Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, pose.gaze.pitch)));
  // 注视方向；y 向下，所以 pitch 取负
  const forward: Vec3 = [
    Math.sin(yaw) * Math.cos(pitch),
    -Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const right = norm(cross([0, -1, 0], forward));
  const up = cross(forward, right);

  const eye = rig.eyes[index];
  const lateral = deg(eye.lateralDeg);
  const vertical = deg(eye.verticalDeg);
  const normal = norm([
    Math.cos(vertical) * (Math.cos(lateral) * forward[0] + Math.sin(lateral) * right[0]) +
      Math.sin(vertical) * up[0],
    Math.cos(vertical) * (Math.cos(lateral) * forward[1] + Math.sin(lateral) * right[1]) +
      Math.sin(vertical) * up[1],
    Math.cos(vertical) * (Math.cos(lateral) * forward[2] + Math.sin(lateral) * right[2]) +
      Math.sin(vertical) * up[2],
  ]);

  const centre: Vec3 = [
    normal[0] * rig.sphereRadius,
    normal[1] * rig.sphereRadius,
    normal[2] * rig.sphereRadius,
  ];

  const tangent = norm(cross([0, -1, 0], normal));
  const binormal = cross(normal, tangent);

  // 切平面基 → 屏幕（丢弃 z），再叠加单眼倾斜
  const tilt = deg(eye.tiltDeg);
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const ax = tangent[0] * cos + binormal[0] * sin;
  const ay = tangent[1] * cos + binormal[1] * sin;
  const bx = binormal[0] * cos - tangent[0] * sin;
  const by = binormal[1] * cos - tangent[1] * sin;

  const halfWidth = eye.halfWidth;
  const halfHeight = eye.halfHeight * pose.lidOpen;

  return {
    matrix: [ax * halfWidth, ay * halfWidth, bx * halfHeight, by * halfHeight, centre[0], centre[1]],
    depth: normal[2],
  };
}
