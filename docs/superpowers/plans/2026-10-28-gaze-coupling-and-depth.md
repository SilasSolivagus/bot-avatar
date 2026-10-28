# 注视联动与深度淡出 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让"转头"看起来是头在转（身体跟着动），让转到侧面的眼睛按深度淡出、转到脑后消失。

**Architecture:** 两个纯增量，都在渲染器与 rig 类型里：

1. **身体联动**：`SphereEyeRig` 增加 `bodyCoupling`（0–1）。渲染时把**身体与眼睛整体**旋转 `yaw × coupling`，同时把**投影用的 yaw** 降为 `yaw × (1 − coupling)`。两者相加仍等于 `yaw`，所以"视线仍然精确指向目标"，只是其中一部分由头来完成。这个拆分是必须的：若只转身体、投影仍用全量 yaw，眼睛会相对脸部多转一遍。
2. **深度淡出**：`projectEye` 已经返回 `depth`（球面法线的 z）。按 `fadeFromDepth`/`cullAtDepth` 折算成不透明度；低于 `cullAtDepth` 的眼睛**整个不输出**。

**Spec:** `docs/design/2026-10-28-contract-v2.md` §4；现有实现见 `packages/engine/src/eye-projection.ts`、`packages/renderer-svg/src/index.ts`。

## 全局约束

- `rect` rig 的输出**逐字节不变**（现有 24 组比对仍然是门）。
- 不引入新依赖；不读时钟、不读随机。
- 球面包无 `surface` 的约束不变（带材质仍要显式报错）。
- 深度阈值沿用 rig 里的既有字段，不新增常量。

## Task 1: 身体联动

**Files:**
- Modify: `packages/engine/src/geometry.ts`（`SphereEyeRig` 加 `bodyCoupling`）
- Modify: `packages/renderer-svg/src/index.ts`
- Test: `packages/renderer-svg/test/render.test.ts`

**Interfaces:**
- `SphereEyeRig.bodyCoupling: number`（0–1；0 = 只动眼睛，1 = 只动头）。

- [ ] **Step 1: 失败的测试**

- `bodyCoupling: 0` 时，`rotate` 不出现，眼睛矩阵与不联动时完全一致。
- `bodyCoupling: 0.5`、`yaw: 40` 时：输出里有一个 `rotate(20)` 的组；且**近眼宽度**与 `bodyCoupling: 0`、`yaw: 40` 时相同（因为总注视角没变，只是拆分方式变了）。
  这条是核心：联动的含义是"谁来转"，不是"转多少"。
- `bodyCoupling: 1`、`yaw: 40` 时：`rotate(40)`，且眼睛投影等价于 `yaw: 0`（头全转了，眼睛相对不动）。

- [ ] **Step 2: 实现**

渲染球面 rig 时：

```ts
const bodyTurn = clamp01(rig.bodyCoupling) * pose.gaze.yaw;
const eyeYaw = pose.gaze.yaw * (1 - clamp01(rig.bodyCoupling));
const projected = [0, 1].map(i => projectEye(rig, { ...pose, gaze: { ...pose.gaze, yaw: eyeYaw } }, i as 0 | 1));
```

输出结构：`<g transform="rotate(bodyTurn)">` 包住身体与眼睛；`bodyTurn` 为 0 时**不输出**这个属性（保证未联动时字节不变）。

- [ ] **Step 3: 提交**

```bash
git commit -m "feat(svg): let the head carry part of the gaze"
```

## Task 2: 深度淡出与剔除

**Files:**
- Modify: `packages/renderer-svg/src/index.ts`
- Test: `packages/renderer-svg/test/render.test.ts`

- [ ] **Step 1: 失败的测试**

用 `fadeFromDepth: 0.12`、`cullAtDepth: 0.02`（rig 里的既有值）：

- `yaw: 45`：远眼 `depth ≈ 0.45` → 不透明度 1，**无 `opacity` 属性**（避免无谓输出）。
- `yaw: 85`：远眼 `depth ≈ 0.087` → `opacity ≈ 0.67`，属性存在。
- `yaw: 95`：远眼 `depth < 0` → **该眼睛不出现**（`<rect` 计数从 2 变 1）。
- 近眼在所有上述角度仍是全不透明。

- [ ] **Step 2: 实现**

```ts
const alpha = (depth - rig.cullAtDepth) / (rig.fadeFromDepth - rig.cullAtDepth);
if (alpha <= 0) continue;                       // 完全剔除
if (alpha < 1) attrs += ` opacity="${alpha.toFixed(3)}"`;
```

- [ ] **Step 3: 提交**

```bash
git commit -m "feat(svg): fade and cull eyes by depth"
```

## 自审

**覆盖。** 用户点名的两件事：身体联动（Task 1）、深度用到实处（Task 2）。

**风险。** 如果 `bodyCoupling` 只转身体不降 yaw，眼睛会多转一次——测试里"近眼宽度不变"那条就是防这个。

**未做。** 挖洞裁剪（眼睛出界仍靠联动缓解，不根治）、球面包的启动校验，两者留到阶段 B 收尾。
