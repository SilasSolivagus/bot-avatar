# 形状剖面模型（radii[64]）— 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把形状从"手绘多边形"换成"64 个半径的剖面"，用参数化生成器产出八个形状，并按视觉重量归一化。

**Architecture:** 新增 `packages/engine/src/profile.ts`（生成器 + 归一化 + 剖面→点集）；`ShapeFamily` 增加 `radii?: readonly number[]`，与既有 `outline` 二选一；渲染器与 `radiusAtAngle` 对 `radii` 走 O(1) 查表插值；`rect` 老包继续用 `outline`，输出逐字节不变。

**Spec:** `docs/design/2026-10-28-shape-profiles.md`（证据与参数）；`AGENTS.md` 铁律二。

## 全局约束

- `PROFILE_SAMPLES = 64`，角度 `i/64 · 2π`。
- 归一化：最大半径缩到目标值；方的目标 `1.15`，云/卵石 `1.02`，水滴 `1.04`，其余 `1.0`。
- `rect` 包（organic-blob）输出逐字节不变。
- 纯函数、无 I/O、无时钟。

## Task 1: 生成器与归一化

**Files:** Create `packages/engine/src/profile.ts`, `packages/engine/test/profile.test.ts`; Modify `packages/engine/src/index.ts`。

**Interfaces:**
```ts
export const PROFILE_SAMPLES = 64;
export function normalizeRadii(radii: readonly number[], max?: number): number[];
export function superellipseProfile(n: number, sx?: number, sy?: number): number[];
export function regularPolygonProfile(sides: number, radius: number, cornerRadius: number, rotationDeg?: number): number[];
export function unionOfCirclesProfile(circles: ReadonlyArray<{ x: number; y: number; r: number }>): number[];
export function hullOfCirclesProfile(a: {x:number;y:number;r:number}, b: {x:number;y:number;r:number}): number[];
export function harmonicProfile(terms: ReadonlyArray<{ amplitude: number; frequency: number; phase: number }>, base?: number): number[];
export function radiiToPoints(radii: readonly number[]): Array<[number, number]>;
```

**测试要点：** `superellipseProfile(2)` 各半径相等（圆）；`superellipseProfile(4)` 的对角线半径 > 轴向半径；`regularPolygonProfile(6, 1, 0.26)` 的半径在 64 个角度上有六个极大的峰；圆角越大，峰谷比越小；`unionOfCirclesProfile` 对两个相离圆的并集取到较远者；`hullOfCirclesProfile` 的剖面是凸的；`harmonicProfile` 的振幅上下界符合给定值；`normalizeRadii` 让最大值为目标值且比例保持。

## Task 2: `ShapeFamily.radii` 与路径/半径查询

**Files:** Modify `packages/engine/src/spec.ts`（`ShapeFamily.radii?`）、`packages/engine/src/outline.ts` 或新增 `packages/engine/src/profile-path.ts`、`packages/engine/src/build-geometry.ts`、`packages/engine/test/geometry-from-spec.test.ts`。

- `ShapeFamily` 允许 `{ radii }` 或 `{ outline }`，二者必居其一（类型上可选，运行时校验）。
- `radiiToPath(radii, { closed: true })`：把 64 个点连成平滑闭合路径（与现有 Catmull-Rom 同一套曲率处理，复用 `outlinePath` 的曲线生成部分，输入先用 `radiiToPoints`）。
- `radiusAtAngle` 对 `radii` 走直接查表 + 相邻插值，**不再做射线求交**。
- `deriveFace` 接受 `radii`：最小半径在 ±50° 窗口内取 64 个索引中的子集。
- 约束：`radii.length === 64`、全部为正、和为有限数，否则抛错。

## Task 3: 八个形状的包

**Files:** Create `packages/engine/src/shapes-preset.ts`（或 pack 内），`apps/gallery/src/packs/art.ts`。

按证据文档的参数用生成器造八个形状：圆、卵石、方、胶囊、三角、六边、云、水滴。每个带自己的归一化目标。`art` 包同时带 12 色（9 有彩 + 墨/灰/米）与球面眼睛配置。

## Task 4: 画廊与视觉验证

`apps/gallery` 增加 `art` 包；截图：12 色单形状条 + 八形状墙；确认三个此前的问题都消失——方不再显小、卵石不再畸形、六边不再变圆。

## Task 5: 文档

`docs/design/2026-10-28-shape-profiles.md` 补一节"我们采用的参数值"；README 的风格包一节说明形状是 `radii[64]`。

## 自审

**覆盖。** 铁律二（剖面模型）、视觉重量归一化、圆角参数化、八形状清单。

**风险。** 形状过渡（插值）本次只准备数据，不实现过渡动画；过渡留到状态机那一轮。`rect` 包的 `outline` 路径必须零改动，用现有 24 组字节比对守住。
