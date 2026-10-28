# 契约 v2 第 1 步：类型与适配器 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入 `AvatarGeometry` 与 `toGeometry(pack, spec)`，让"角色是什么"可以被描述成几何，同时**现有渲染输出逐字节不变**。

**Architecture:** 纯增量。新增 `packages/engine/src/geometry.ts`（类型）与 `geometry-from-spec.ts`（适配器）；`buildAvatarSpec` 一行不改；渲染器一行不改。适配器把 v1 的信息**如实描述**成几何，不发明新语义：v1 的眼睛是"两个矩形 + 整组旋转"，几何里就记为 `rig.kind = "rect"`；将来的球面眼睛记为 `kind = "sphere"`，两者共存，渲染器按 `kind` 分支。

**Spec:** `docs/design/2026-10-28-contract-v2.md` §3–§5；`docs/specs/2026-10-27-bot-avatar-spec.md` §5（v1 契约不变）。

## 全局约束

- **零输出变化**：现有 265 个测试必须继续全绿，任何渲染字节不得改变。
- `buildAvatarSpec` 不改签名、不改行为。
- 新类型与适配器都是纯函数，不引入依赖，不读磁盘、不读时钟。
- `dependencies` 与 `peerDependencies` 保持为空。
- 几何必须**自足**：只凭几何 + 渲染器就能画出图，不需要回头查 pack。这是后面让 PNG/3D 共用同一份数据的条件。
- 曲线类型只有两种：`smooth`（现有 Catmull-Rom 平滑）与 `hard`（直线折角）。`hard` 本步只声明，不实现渲染。

## 结构

```
packages/engine/src/geometry.ts           AvatarGeometry、Body、EyeRig（两种 kind）、Pose、Ink
packages/engine/src/geometry-from-spec.ts toGeometry(pack, spec): AvatarGeometry
packages/engine/test/geometry-from-spec.test.ts
```

---

### Task 1: 类型

**Files:**
- Create: `packages/engine/src/geometry.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces: `AvatarGeometry`、`Body`、`EyeRig`（判别联合）、`Pose`、`Ink`、`Point`。

- [ ] **Step 1: 写类型**

`packages/engine/src/geometry.ts`:
```ts
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
  /** 循环时长，毫秒；v1 的 durationMs */
  durationMs: number;
  motionAmplitude: number;
  /** v1 的可见性：本步不填，留给后续步骤 */
  accessories?: ReadonlyArray<unknown>;
}
```

- [ ] **Step 2: 导出**

`packages/engine/src/index.ts` 增加：
```ts
export type {
  AvatarGeometry,
  Body,
  EyeRig,
  Ink,
  Point,
  Pose,
  RectEyeRig,
  SphereEyeRig,
} from "./geometry.js";
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 通过（新类型暂无人使用）。

- [ ] **Step 4: 提交**

```bash
git add packages/engine
git commit -m "feat(engine): add the geometry contract types"
```

---

### Task 2: 适配器

**Files:**
- Create: `packages/engine/src/geometry-from-spec.ts`, `packages/engine/test/geometry-from-spec.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `StylePack`、`AvatarSpec`、`phaseForSeed`、`outlinePath`。
- Produces: `toGeometry(pack: StylePack, spec: AvatarSpec): AvatarGeometry`。

- [ ] **Step 1: 写失败的测试**

`packages/engine/test/geometry-from-spec.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { buildAvatarSpec } from "../src/spec.js";
import { outlinePath, phaseForSeed } from "../src/outline.js";
import { toGeometry } from "../src/geometry-from-spec.js";
import { fixtureRows } from "./helpers.js";

describe("toGeometry", () => {
  it("describes the same body the spec was built from", () => {
    for (const row of fixtureRows.slice(0, 12)) {
      const spec = buildAvatarSpec(organicBlob, row.identity);
      const geometry = toGeometry(organicBlob, spec);
      expect(geometry.body.outline).toEqual(organicBlob.shapes[spec.family]!.outline);
      expect(geometry.body.phase).toBe(phaseForSeed(spec.seed));
      expect(geometry.body.smoothingPasses).toBe(organicBlob.shapes[spec.family]!.smoothingPasses);
      expect(geometry.body.curve).toBe("smooth");
      expect(geometry.body.viewBox).toBe(organicBlob.viewBox);
    }
  });

  it("reproduces the spec's path exactly from the geometry alone", () => {
    for (const row of fixtureRows.slice(0, 12)) {
      const spec = buildAvatarSpec(organicBlob, row.identity);
      const geometry = toGeometry(organicBlob, spec);
      const rebuilt = outlinePath(geometry.body.outline, {
        phase: geometry.body.phase,
        smoothingPasses: geometry.body.smoothingPasses,
      });
      expect(rebuilt).toBe(spec.path);
      expect(rebuilt).toBe(row.path);
    }
  });

  it("carries the legacy eye rig unchanged", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    const geometry = toGeometry(organicBlob, spec);
    expect(geometry.rig.kind).toBe("rect");
    if (geometry.rig.kind !== "rect") throw new Error("unreachable");
    expect(geometry.rig.eyes).toEqual(organicBlob.eyes.eyes);
    expect(geometry.rig.rotationDeg).toBe(spec.eyeRotation);
  });

  it("carries identity, palette and motion", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    const geometry = toGeometry(organicBlob, spec);
    expect(geometry.seed).toBe(spec.seed);
    expect(geometry.family).toBe(spec.family);
    expect(geometry.look).toBe(spec.look);
    expect(geometry.ink.body).toBe(spec.color.light);
    expect(geometry.ink.bodyHighlight).toBe(spec.color.dark);
    expect(geometry.ink.eyes).toBe(spec.color.eye);
    expect(geometry.durationMs).toBe(spec.durationMs);
    expect(geometry.pose).toEqual({ gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 });
  });

  it("is a pure function of its inputs", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    expect(toGeometry(organicBlob, spec)).toEqual(toGeometry(organicBlob, spec));
  });
});
```

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run packages/engine/test/geometry-from-spec.test.ts`
Expected: FAIL — 无法解析 `../src/geometry-from-spec.js`。

- [ ] **Step 3: 实现**

`packages/engine/src/geometry-from-spec.ts`:
```ts
import type { AvatarSpec, StylePack } from "./spec.js";
import type { AvatarGeometry } from "./geometry.js";
import { phaseForSeed } from "./outline.js";

/** 把 v1 的 spec 如实描述成几何：不发明新语义，只换一种表达。 */
export function toGeometry(pack: StylePack, spec: AvatarSpec): AvatarGeometry {
  const shape = pack.shapes[spec.family]!;
  return {
    packId: spec.packId,
    packVersion: spec.packVersion,
    identity: spec.identity,
    seed: spec.seed,
    family: spec.family,
    look: spec.look,
    body: {
      outline: shape.outline,
      phase: phaseForSeed(spec.seed),
      smoothingPasses: shape.smoothingPasses ?? 2,
      curve: "smooth",
      viewBox: spec.viewBox,
    },
    rig: {
      kind: "rect",
      eyes: spec.eyes,
      rotationDeg: spec.eyeRotation,
    },
    pose: { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 },
    ink: {
      body: spec.color.light,
      bodyHighlight: spec.color.dark,
      eyes: spec.color.eye,
    },
    durationMs: spec.durationMs,
    motionAmplitude: spec.motionAmplitude,
  };
}
```

- [ ] **Step 4: 跑测试与整套**

Run: `pnpm vitest run packages/engine/test/geometry-from-spec.test.ts && pnpm test`
Expected: 新测试通过，整套 265+ 全绿。

- [ ] **Step 5: 导出并提交**

`packages/engine/src/index.ts` 增加 `export { toGeometry } from "./geometry-from-spec.js";`

```bash
git add packages/engine
git commit -m "feat(engine): describe an avatar spec as geometry"
```

---

### Task 3: 渲染器按几何重画（与 v1 逐字节一致）

**Files:**
- Modify: `packages/renderer-svg/src/index.ts`, `packages/renderer-svg/test/render.test.ts`

**Interfaces:**
- Consumes: `AvatarGeometry`。
- Produces: `renderGeometry(geometry, { size, state }): string` —— 对 `rig.kind === "rect"` 必须与 `renderSvg(spec)` **字节相同**；`kind === "sphere"` 抛 `UnsupportedRigError`。

- [ ] **Step 1: 写失败的测试**

追加到 `packages/renderer-svg/test/render.test.ts`：
```ts
import { toGeometry } from "@botavatar/engine";
import { renderGeometry } from "../src/index.js";

describe("renderGeometry", () => {
  it("matches renderSvg byte for byte for a legacy rig", () => {
    for (const identity of ["alice", "bob", "张三", "wall-3-0"]) {
      const spec = buildAvatarSpec(organicBlob, identity);
      for (const state of ["idle", "working"] as const) {
        for (const size of [32, 96, 160]) {
          expect(renderGeometry(toGeometry(organicBlob, spec), { size, state })).toBe(
            renderSvg(spec, { size, state }),
          );
        }
      }
    }
  });

  it("refuses a rig it cannot draw yet", () => {
    const geometry = toGeometry(organicBlob, buildAvatarSpec(organicBlob, "alice"));
    const sphere = { ...geometry, rig: { ...geometry.rig, kind: "sphere" as const } };
    expect(() => renderGeometry(sphere as never, { size: 32 })).toThrow(/sphere/i);
  });
});
```

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run packages/renderer-svg/test/render.test.ts -t renderGeometry`
Expected: FAIL — `renderGeometry` 不存在。

- [ ] **Step 3: 实现**

最省事且最不会错的做法：**内部把几何折回一份等价 spec，再调用现有 `renderSvg`**。v1 的每个字段都要能从几何恢复：

```ts
export function renderGeometry(geometry: AvatarGeometry, options: RenderOptions): string {
  if (geometry.rig.kind !== "rect") {
    throw new Error(`renderGeometry: ${geometry.rig.kind} rig is not implemented yet`);
  }
  const spec: AvatarSpec = {
    packId: geometry.packId,
    packVersion: geometry.packVersion,
    identity: geometry.identity,
    seed: geometry.seed,
    family: geometry.family,
    look: geometry.look,
    color: {
      // v1 的 PaletteColor 需要 id/name；几何只带颜色，因此从颜色值反推一个稳定的 id
      id: `ink-${geometry.ink.eyes.replace("#", "")}`,
      name: "geometry",
      light: geometry.ink.body,
      dark: geometry.ink.bodyHighlight,
      eye: geometry.ink.eyes,
    },
    path: outlinePath(geometry.body.outline, {
      phase: geometry.body.phase,
      smoothingPasses: geometry.body.smoothingPasses,
    }),
    eyes: geometry.rig.eyes,
    eyeRotation: geometry.rig.rotationDeg,
    durationMs: geometry.durationMs,
    motionAmplitude: geometry.motionAmplitude,
    viewBox: geometry.body.viewBox,
  };
  return renderSvg(spec, options);
}
```

**注意**：`color.id` 会进入渐变 id（我们刚修过 id 冲突）。这里用 `ink-<eye 色>` 反推，可能与原 pack 的 `color.id` 不同，从而使**渐变 id 字符串不同**——那就不满足"字节相同"。

所以正确做法是：**几何里带上原始 `color.id` 与 `name`**，而不是反推。Task 1 的 `Ink` 增加两个字段 `bodyId`、`bodyName`（由适配器从 `spec.color` 拷过来），本任务的 `renderGeometry` 直接用它们。这样字节一致才成立。

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run packages/renderer-svg/test/render.test.ts`
Expected: 全部通过，包括新增的两条。

- [ ] **Step 5: 提交**

```bash
git add packages
git commit -m "feat(svg): render from geometry for the legacy rig"
```

---

## 自审

**覆盖。** 设计文档 §3 的类型（Task 1，`Ink` 按 Task 3 的需要补 `bodyId`/`bodyName`）、§4 的球面 rig（Task 1 只声明，渲染留待后续）、§5 的每形状锚点（本步不做，`Body` 里暂不出现，等球面 rig 一起加）。适配器保证"几何自足"（Task 2 用只凭几何重算 path 的测试证明）。Task 3 用 24 组 `(身份 × 状态 × 尺寸)` 的字节比对把"零输出变化"钉死。

**占位风险。** Task 3 Step 3 里我写了"反推 color.id"的错误做法再纠正——和上一份计划同样的毛病。实现时必须直接做正确版本（几何携带 `bodyId`/`bodyName`），不要先写反推。

**已知取舍。** `renderGeometry` 内部折回 spec 再调用 `renderSvg`，等于多一层对象构造。这是**故意的**：第一步要证明"几何能表达现有输出"，而不是重写渲染器。等球面 rig 落地时，`renderSvg` 会被拆成"几何 → 图元"，那时这层折返自然消失。
