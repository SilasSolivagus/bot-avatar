# 球面 rig 的启动校验 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让坏的球面眼睛配置在**启动时**就被拒绝，而不是等到第一个请求渲染时崩。同时让穷举自检覆盖球面包的多个姿态。

**Architecture:** 两处补强，都在服务的边界层：
1. `parsePack` 增加球面分支：逐字段校验数值范围、两只眼睛、阈值次序，以及"倾斜只在长眼睛上可见"这条几何规则。
2. `assertPackRenders` 对球面包改走 `buildGeometry` + `renderGeometry`，扫 `家族 × 配色 × 若干姿态`，并断言每只胶囊**仍在轮廓内**。

`rect` 包的校验与自检完全不动。

**Spec:** `docs/specs/2026-10-27-bot-avatar-spec.md` §10.1（边界解析、启动穷举）；`docs/design/2026-10-28-flat-not-volumetric.md`。

## 全局约束

- 坏包必须**以非零码退出**，错误消息点名文件与字段路径（如 `eyes.sphereRadius`）。
- 现有 `rect` 包的校验行为、消息与自检次数不变。
- 校验必须纯函数：无 I/O、无时间。
- 自检的渲染次数仍有上限（1000），超限抽样并声明。

## Task 1: `parsePack` 的球面分支

**Files:** Modify `apps/service/src/packs.ts`; Test `apps/service/test/packs.test.ts`。

**校验项**（任一不满足即 `PackError`，消息含 `origin` 与字段路径）：

| 字段 | 规则 |
| --- | --- |
| `eyes.kind` | 只接受 `"rect"` 或 `"sphere"`；其他值报错 |
| `eyes.sphereRadius` | 有限数，`> 0` |
| `eyes.eyes` | 恰好 2 项 |
| `eyes.eyes[i].lateralDeg / verticalDeg / halfWidth / halfHeight / tiltDeg` | 有限数；`halfWidth`/`halfHeight` `> 0` |
| `eyes.cullAtDepth / fadeFromDepth` | 有限数，`0 ≤ cull < fade ≤ 1` |
| `eyes.bodyCoupling / bodyPitchFollow`（可选） | 若存在，有限数且在 `[0, 1]` |
| 倾斜可见性 | `|tiltDeg| ≥ 20` 时长宽比 `width/height` 必须落在 `[0.6, 1.7]` 之外；否则落在 `[0.8, 1.25]` 之外。比率按 `2·halfWidth / (2·halfHeight)` 算 |

**测试**：`sphereRadius: 0`、`-1`、`NaN`、`eyes` 长度 3、`cull > fade`、`bodyCoupling: 3`、`tiltDeg: 30` 配长宽比 1.0（圆眼睛歪头看不出来）——各自命名对应字段；一个合法球面包通过。

## Task 2: 自检覆盖球面包

**Files:** Modify `apps/service/src/conformance.ts`; Test `apps/service/test/conformance.test.ts`。

**做法**：`assertPackRenders` 读取 `pack.eyes.kind`：

- `"rect"`：走现有路径，一行不改。
- `"sphere"`：对每个 `家族 × 配色`，在姿态 `{0,0}`、`{-44,0}`、`{44,0}`、`{0,25}`、`{0,-25}` 下 `buildGeometry` → `renderGeometry`，断言：
  1. 输出以 `<svg` 开头、`</svg>` 结尾，且不含 `NaN`/`undefined`/`Infinity`/`[object Object]`；
  2. 每只胶囊的外沿落在轮廓内：用 `radiusAtAngle` 复核；
  3. 极端 yaw 下**两只眼睛的中心不重合**（防止间距被压成 0）。

渲染次数 = `家族 × 配色 × 5`；仍受 1000 上限约束，超限抽样。

**测试**：合法球面包通过且次数正确；`halfHeight: 0` 的球面包在自检中抛错并点名家族/配色/姿态；`bodyCoupling: 1` + 极端 yaw 时眼睛重合的那一例被拒绝。

## Task 3: 启动路径的实证

**Files:** 无代码改动；报告里记录。

用真实 CLI 跑三次，记录退出码与首行 stderr：

1. 合法球面包（`apps/gallery/src/packs/geo.ts`）→ 启动成功，`/v1/packs` 含 `geo`；
2. `sphereRadius: 0` 的包 → 退出 1，消息含 `eyes.sphereRadius`；
3. `tiltDeg: 30` + 圆眼睛的包 → 退出 1，消息含 `eyes.eyes[0].tiltDeg`。

## 自审

**覆盖。** 用户点名的"坏 rig 在渲染时炸"→ 现在在 `parsePack` 与自检两处拦截；顺带补上"球面包从未被自检覆盖"这个更大的洞。

**风险。** 倾斜可见性规则可能误杀合法的细长眼睛——阈值照抄参考实现的测量（`[0.6,1.7]` / `[0.8,1.25]`），若发现误杀，先加测试再调阈值。

**未做。** 配件、表情、状态机的校验（那些字段还不存在）。
