# 有机眼睛：自动脸部参数、胶囊眼、头眼联动 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已经验证过的原型落进库：眼睛按形状自动定大小与间距、形状是真胶囊不是椭圆、头随注视左右转也上下点，且鼠标跟随由客户端驱动。

**Architecture:** 三处增量。
1. 引擎新增 `radiusAtAngle(outline, angle)` 与 `deriveFace(outline, style)`：脸部参数**由轮廓推导**，不写死。
2. 渲染器把球面眼睛从「矩阵压扁的 rect」改成「本地坐标的真胶囊 + 只施加旋转」——这是椭圆变胶囊的唯一正确做法。
3. rig 增加 `bodyPitchFollow`：注视的俯仰分一部分给头部（竖直位移），眼睛拿剩下的；与已有的 `bodyCoupling`（左右）对称，总量守恒。

`rect` 包（organic-blob）的渲染路径完全不动，输出逐字节不变。

**Spec:** `docs/design/2026-10-28-flat-not-volumetric.md`（平涂、挖空、平面旋转）；`docs/design/2026-10-28-contract-v2.md` §4（球面投影）。

## 全局约束

- `rect` rig 输出逐字节不变（24 组比对是门）。
- 所有推导是纯函数；不读时钟、不读随机、不读 DOM。
- 眼睛必须是**胶囊**：本地坐标下 `rx = 半宽`，只施加旋转与平移；不得用矩阵压扁圆角。
- 静止倾斜**同向**（默认 −4°），镜像倾斜只留给表情。
- 总量守恒：`headYaw + eyeYaw = yaw`，`headPitch + eyePitch = pitch`。

## Task 1: `radiusAtAngle` 与自动脸部参数（引擎）

**Files:** Create `packages/engine/src/face.ts`, `packages/engine/test/face.test.ts`; Modify `packages/engine/src/geometry.ts`（rig 增字段）、`packages/engine/src/build-geometry.ts`、`packages/engine/src/index.ts`。

**Interfaces:**
```ts
export function radiusAtAngle(outline: ReadonlyArray<Point>, angleRad: number): number;
export interface FaceStyle {
  /** 眼睛尺寸相对轮廓最小半径的比例 */
  eyeHeightRatio?: number; // 默认 0.30
  eyeAspect?: number;      // 高/宽，默认 2.27（即宽 ≈ 高×0.44）
  /** 眼睛中心相对轮廓的上下偏移比例 */
  centreOffsetRatio?: number; // 默认 -0.14（略微偏上）
  /** 眼睛与轮廓的最小留白（viewBox 单位） */
  margin?: number;         // 默认 2
}
export interface Face {
  rMin: number; splitDeg: number; halfWidth: number; halfHeight: number; dy: number;
}
export function deriveFace(outline: ReadonlyArray<Point>, style?: FaceStyle): Face;
```

**规则**：在 ±50° 范围内按 2° 步长取 `radiusAtAngle` 的最小值 `rMin`；`halfHeight = clamp(0.30·rMin, 5, 12)`；`halfWidth = halfHeight × 0.44`；`splitDeg = asin(min(0.9, 2.4·halfWidth / rMin))` 转角度并下限 4°；`dy = −0.14·rMin`。

**测试要点**：正方形（边长 92）在 45° 的 `radiusAtAngle` 约为 65.05；云朵、方形（超椭圆）、星形的 `halfHeight` 严格递减；星形的 `halfWidth < 4`；同输入两次结果相同。

**rig 变化**：`SphereEyeRig` 增加
```ts
/** 俯仰分给头部的比例，0..1；与 bodyCoupling 对称 */
bodyPitchFollow: number;
/** 眼睛静止倾斜（同向，度） */
restTiltDeg: number;
```
`buildGeometry` 在 `kind === "sphere"` 时用 `deriveFace(body.outline, style)` 覆写 `eyes[i].lateralDeg/halfWidth/halfHeight`，把 `dy` 写进新增的 `rig.anchorY`，并把 `restTiltDeg` 同时填到两只眼睛的 `tiltDeg`。

## Task 2: 胶囊眼 + 头部俯仰（渲染器）

**Files:** Modify `packages/renderer-svg/src/index.ts`, `packages/renderer-svg/test/render.test.ts`。

**胶囊**：把投影矩阵拆成 `angle = atan2(b, a)`、`sx = hypot(a,b)`、`sy = hypot(c,d)`，输出
```html
<g transform="translate(cx cy) rotate(angle)"><rect x="-sx" y="-sy" width="2sx" height="2sy" rx="sx"/></g>
```
`rx = sx`（半宽）保证端头是半圆。**不得**再对 `rect` 使用投影矩阵。

**头部俯仰**：整体组增加 `translate(0, -pitch × bodyPitchFollow × 0.6)`；同时投影用的 `pitch` 降为 `pitch × (1 − bodyPitchFollow)`。`bodyPitchFollow` 为 0 时不输出 `translate`（保持字节不变）。

**测试要点**：静止时眼睛是 `rect` 且 `rx == width/2`；右看 30° 时远眼 `width` 更小但 `rx == width/2` 仍成立；抬头 20° 时外层出现 `translate(0,-…)` 且眼睛投影角减小；`bodyPitchFollow: 0` 时无 `translate`；`rect` rig 的 24 组比对仍然全绿。

## Task 3: 画廊的第二个物种与鼠标跟随

**Files:** Create `apps/gallery/src/packs/geo.ts`; Modify `apps/gallery/src/App.tsx`, `components/DetailCard.tsx`。

- `geo` 包：两个形状（超椭圆方形、胶囊），各自轮廓，`smoothingPasses: 1`；palette 沿用 organic-blob 的 11 色；球面眼睛；`bodyCoupling: 0.35`、`bodyPitchFollow: 0.35`、`restTiltDeg: -4`。
- **鼠标跟随**：详情卡（或整页）监听 `pointermove`，把相对位置映射成 `yaw ∈ [-45,45]`、`pitch ∈ [-25,25]`，实时重渲染；离开窗口时回到静止。**这是"头眼一起动"的可视验证**。
- 现有 yaw/pitch 滑杆保留，作为手动模式。

## Task 4: 文档

把三条规则写进 `docs/design/2026-10-28-flat-not-volumetric.md` 的"要做三件事"后面：自动脸部参数、胶囊端头、静止倾斜同向；并在 README 的风格包一节补一句"脸部参数由轮廓推导，包作者不需要写"。

## 自审

**覆盖。** 用户点名的四件事：眼睛不能是椭圆（Task 2）、不能倒八（`restTiltDeg` 同向，Task 1/2）、头眼一起动（Task 2 俯仰 + Task 3 鼠标）、换形状（Task 3 的方形/胶囊）。

**风险。** `deriveFace` 把眼睛写进 geometry 之后，pack 里声明的 `lateralDeg/halfWidth` 会被覆盖——必须在 `buildGeometry` 的注释里写明"球面 rig 的眼睛尺寸由轮廓推导，pack 里写的不生效"。

**未做。** 圆形包（organic-blob）不迁移到球面眼睛；球面 rig 的启动校验仍未接入 `parsePack`（欠账，单独一轮）。
