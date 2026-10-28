# 球面眼睛：两阶段实施计划（先"能看"，再"能用"）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让头像长出一对"长在球面上"的眼睛：转头时有透视、抬头时会倾斜、眨眼会闭合。第一阶段只求"看得见效果"，第二阶段才求"经得起用"。

**Architecture:** 几何契约已在 `packages/engine/src/geometry.ts` 落地，`EyeRig` 是 `rect | sphere` 的判别联合，`sphere` 成员已声明但无人绘制。本计划新增一个纯函数把 `(yaw, pitch)` 投成每只眼睛的 2×2 矩阵与深度，渲染器按 `rig.kind` 分支；新增 `buildGeometry(pack, identity)` 作为 v2 的入口，`rect` 包走现有路径，输出逐字节不变。

**Spec:** `docs/design/2026-10-28-contract-v2.md` §4（球面投影）；`docs/design/2026-10-28-eye-rig-absorption.md`（吸收清单）。

## 全局约束

- `rect` rig 的输出**逐字节不变**：现有 273 个测试与 24 组字节比对必须继续通过。
- 球面投影是**纯函数**：不读时钟、不读随机、不读 DOM。
- 每只眼睛的变换顺序固定：**切平面矩阵 → 单眼倾斜 → 眨眼压扁**。顺序错了，眨眼会沿胶囊长轴发生。
- `dependencies` / `peerDependencies` 仍为空。
- 第一阶段不启用挖空（`paint: "hole"`），眼睛仍是实心色；挖空在第二阶段。
- 注视角度的默认范围 **±45°**，超出由调用方决定（第二阶段再加形状相关的钳制）。

## 阶段 A：能看（4 个任务）

### Task A1: 投影数学

**Files:**
- Create: `packages/engine/src/eye-projection.ts`, `packages/engine/test/eye-projection.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Produces:
  - `interface ProjectedEye { matrix: readonly [number, number, number, number, number, number]; depth: number }` — SVG `matrix(a b c d e f)` 的六个数字，坐标系与 `viewBox` 一致（y 向下）。
  - `projectEye(rig: SphereEyeRig, pose: Pose, index: 0 | 1): ProjectedEye`

- [ ] **Step 1: 写失败的测试**

`packages/engine/test/eye-projection.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { projectEye } from "../src/eye-projection.js";
import type { Pose } from "../src/geometry.js";
import type { SphereEyeRig } from "../src/geometry.js";

const rig: SphereEyeRig = {
  kind: "sphere",
  sphereRadius: 44,
  splitDeg: 18,
  eyes: [
    { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 0 },
    { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 0 },
  ],
  fadeFromDepth: 0.12,
  cullAtDepth: 0.02,
};

const rest: Pose = { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 };

describe("projectEye", () => {
  it("gives both eyes the same depth when looking straight ahead", () => {
    const left = projectEye(rig, rest, 0);
    const right = projectEye(rig, rest, 1);
    expect(left.depth).toBeCloseTo(right.depth, 6);
  });

  it("narrows the far eye as the gaze turns", () => {
    const width = (yaw: number, index: 0 | 1) => {
      const { matrix } = projectEye(rig, { ...rest, gaze: { yaw, pitch: 0 } }, index);
      return Math.hypot(matrix[0], matrix[1]);
    };
    const restWidth = width(0, 0);
    expect(width(25, 0)).toBeLessThan(restWidth * 0.9);
    expect(width(45, 0)).toBeLessThan(width(25, 0));
  });

  it("keeps the near eye wider than the far eye when turned", () => {
    const width = (index: 0 | 1) => {
      const { matrix } = projectEye(rig, { ...rest, gaze: { yaw: 30, pitch: 0 } }, index);
      return Math.hypot(matrix[0], matrix[1]);
    };
    expect(Math.max(width(0), width(1)) / Math.min(width(0), width(1))).toBeGreaterThan(1.1);
  });

  it("tilts when looking up or down", () => {
    const straight = projectEye(rig, rest, 0).matrix;
    const up = projectEye(rig, { ...rest, gaze: { yaw: 0, pitch: 20 } }, 0).matrix;
    expect(Math.abs(up[2] - straight[2])).toBeGreaterThan(0.5);
  });

  it("squashes only the vertical axis when the lid closes", () => {
    const open = projectEye(rig, rest, 0).matrix;
    const shut = projectEye(rig, { ...rest, lidOpen: 0.1 }, 0).matrix;
    expect(shut[0]).toBeCloseTo(open[0], 6);
    expect(shut[1]).toBeCloseTo(open[1], 6);
    expect(Math.hypot(shut[2], shut[3])).toBeCloseTo(Math.hypot(open[2], open[3]) * 0.1, 4);
  });

  it("carries the eye's own tilt, mirroring it between the two eyes", () => {
    const tilted: SphereEyeRig = { ...rig, eyes: [{ ...rig.eyes[0], tiltDeg: 12 }, { ...rig.eyes[1], tiltDeg: -12 }] };
    const a = projectEye(tilted, rest, 0).matrix;
    const b = projectEye(tilted, rest, 1).matrix;
    expect(a[2]).not.toBeCloseTo(b[2], 3);
  });

  it("is a pure function of its inputs", () => {
    expect(projectEye(rig, rest, 0)).toEqual(projectEye(rig, rest, 0));
  });
});
```

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run packages/engine/test/eye-projection.test.ts`
Expected: FAIL — 无法解析 `../src/eye-projection.js`。

- [ ] **Step 3: 实现**

`packages/engine/src/eye-projection.ts`:
```ts
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
 * 一只眼睛在球面上的正交投影。坐标系为 y 向下（与 viewBox 一致）。
 *
 * 顺序固定：切平面基向量 → 单眼倾斜 → 眨眼竖直压扁。反了的话，
 * 眨眼会沿胶囊长轴发生，看起来像变窄而不是闭上。
 */
export function projectEye(rig: SphereEyeRig, pose: Pose, index: 0 | 1): ProjectedEye {
  const yaw = deg(pose.gaze.yaw);
  const pitch = deg(pose.gaze.pitch);
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
```

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run packages/engine/test/eye-projection.test.ts`
Expected: PASS — 7 tests。

- [ ] **Step 5: 导出并提交**

`packages/engine/src/index.ts` 增加：
```ts
export type { ProjectedEye } from "./eye-projection.js";
export { projectEye } from "./eye-projection.js";
```

```bash
git add packages/engine
git commit -m "feat(engine): project an eye onto the sphere"
```

---

### Task A2: `buildGeometry` 入口

**Files:**
- Create: `packages/engine/src/build-geometry.ts`, `packages/engine/test/build-geometry.test.ts`
- Modify: `packages/engine/src/index.ts`, `packages/engine/src/geometry.ts`（`SphereEyeRig` 若缺字段则补）

**Interfaces:**
- Consumes: `buildAvatarSpec`、`toGeometry`、`projectEye`（不直接调用）。
- Produces: `buildGeometry(pack: StylePack, identity: string): AvatarGeometry` —— `pack.eyes.kind === "sphere"` 时构造球面 rig，否则等价于 `toGeometry(pack, buildAvatarSpec(pack, identity))`。

- [ ] **Step 1: 写失败的测试**

`packages/engine/test/build-geometry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { buildAvatarSpec } from "../src/spec.js";
import { toGeometry } from "../src/geometry-from-spec.js";
import { buildGeometry } from "../src/build-geometry.js";
import type { StylePack } from "../src/spec.js";

const spherePack: StylePack = {
  ...organicBlob,
  id: "orb",
  name: "Orb",
  version: "0.1.0",
  eyes: {
    kind: "sphere",
    sphereRadius: 44,
    splitDeg: 18,
    eyes: [
      { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: -6 },
      { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 6 },
    ],
    fadeFromDepth: 0.12,
    cullAtDepth: 0.02,
  },
} as StylePack;

describe("buildGeometry", () => {
  it("matches the spec adapter for a rect pack", () => {
    for (const identity of ["alice", "bob", "wall-3-0"]) {
      expect(buildGeometry(organicBlob, identity)).toEqual(
        toGeometry(organicBlob, buildAvatarSpec(organicBlob, identity)),
      );
    }
  });

  it("builds a sphere rig for a sphere pack", () => {
    const geometry = buildGeometry(spherePack, "alice");
    expect(geometry.rig.kind).toBe("sphere");
    if (geometry.rig.kind !== "sphere") throw new Error("unreachable");
    expect(geometry.rig.sphereRadius).toBe(44);
    expect(geometry.rig.eyes).toHaveLength(2);
  });

  it("keeps identity-derived fields identical across both paths", () => {
    const rect = buildGeometry(organicBlob, "alice");
    const sphere = buildGeometry(spherePack, "alice");
    expect(sphere.seed).toBe(rect.seed);
    expect(sphere.family).toBe(rect.family);
    expect(sphere.look).toBe(rect.look);
    expect(sphere.body.outline).toEqual(rect.body.outline);
  });

  it("is deterministic", () => {
    expect(buildGeometry(spherePack, "alice")).toEqual(buildGeometry(spherePack, "alice"));
  });
});
```

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run packages/engine/test/build-geometry.test.ts`
Expected: FAIL — 无法解析 `../src/build-geometry.js`。

- [ ] **Step 3: 实现**

`packages/engine/src/build-geometry.ts`:
```ts
import { toGeometry } from "./geometry-from-spec.js";
import type { AvatarGeometry, EyeRig } from "./geometry.js";
import { buildAvatarSpec } from "./spec.js";
import type { StylePack } from "./spec.js";

/**
 * v2 入口：由 pack + 身份直接得到几何。
 * `rect` 眼睛的包走 v1 适配器，输出与 renderSvg 完全一致；
 * `sphere` 眼睛的包构造球面 rig，由渲染器做投影。
 */
export function buildGeometry(pack: StylePack, identity: string): AvatarGeometry {
  const spec = buildAvatarSpec(pack, identity);
  const base = toGeometry(pack, spec);
  const eyes = pack.eyes as unknown as { kind?: string };
  if (eyes.kind !== "sphere") return base;

  const rig = pack.eyes as unknown as Extract<EyeRig, { kind: "sphere" }>;
  return {
    ...base,
    rig: {
      kind: "sphere",
      sphereRadius: rig.sphereRadius,
      splitDeg: rig.splitDeg,
      eyes: rig.eyes,
      fadeFromDepth: rig.fadeFromDepth,
      cullAtDepth: rig.cullAtDepth,
    },
    pose: { gaze: { yaw: 0, pitch: 0 }, lidOpen: 1 },
  };
}
```

**类型注记**：`pack.eyes` 现在是 `EyeGeometry`（v1 形状），球面包是在运行时携带额外的 `kind` 字段。这是有意的过渡：v1 类型不改，`buildGeometry` 负责识别。等 v2 pack 类型落地后再收窄。

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run packages/engine/test/build-geometry.test.ts && pnpm test`
Expected: 新测试通过；整套 273+ 全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/engine
git commit -m "feat(engine): build geometry straight from a pack"
```

---

### Task A3: 渲染器画球面眼睛

**Files:**
- Modify: `packages/renderer-svg/src/index.ts`, `packages/renderer-svg/test/render.test.ts`

**Interfaces:**
- Consumes: `AvatarGeometry`、`projectEye`。
- Produces: `renderGeometry` 支持 `rig.kind === "sphere"`：每只眼睛一个 `<rect>`（胶囊：`rx = halfWidth`），`transform` 用投影矩阵，`fill` 用 `ink.eyes`。

- [ ] **Step 1: 写失败的测试**

追加到 `packages/renderer-svg/test/render.test.ts`：
```ts
import { buildGeometry } from "@botavatar/engine";

const orbPack = {
  ...organicBlob,
  id: "orb",
  name: "Orb",
  eyes: {
    kind: "sphere",
    sphereRadius: 44,
    splitDeg: 18,
    eyes: [
      { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: -6 },
      { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 6 },
    ],
    fadeFromDepth: 0.12,
    cullAtDepth: 0.02,
  },
} as never;

describe("sphere rig", () => {
  const geometry = buildGeometry(orbPack, "alice");

  it("draws one capsule per eye with a projection matrix", () => {
    const svg = renderGeometry(geometry, { size: 96 });
    const capsules = svg.match(/<rect[^>]*rx="[^"]*"[^>]*transform="matrix\(/g) ?? [];
    expect(capsules).toHaveLength(2);
  });

  it("narrows the far eye when the gaze turns", () => {
    const still = renderGeometry(geometry, { size: 96 });
    const turned = renderGeometry(
      { ...geometry, pose: { gaze: { yaw: 40, pitch: 0 }, lidOpen: 1 } },
      { size: 96 },
    );
    const first = (svg: string) => svg.match(/matrix\(([-\d. ]+)\)/)?.[1] ?? "";
    expect(first(turned)).not.toBe(first(still));
  });

  it("still renders a rect rig byte for byte as before", () => {
    const spec = buildAvatarSpec(organicBlob, "alice");
    expect(renderGeometry(toGeometry(organicBlob, spec), { size: 96 })).toBe(
      renderSvg(spec, { size: 96 }),
    );
  });
});
```

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run packages/renderer-svg/test/render.test.ts -t "sphere rig"`
Expected: FAIL — 仍然抛 `sphere rig is not implemented yet`。

- [ ] **Step 3: 实现**

在 `renderGeometry` 里按 `rig.kind` 分派：`rect` 走现有折回路径；`sphere` 走新分支，直接拼 SVG（不经过 `AvatarSpec`）：

- 渐变：`ink.body` → `ink.bodyHighlight`，id 用 `av-<packId>-<seed>-<colourDigest>`（复用现有 `colorDigest`，传 `ink.eyes` 参与摘要以免同色不同眼撞 id）
- 身体：`outlinePath(body.outline, { phase, smoothingPasses })`
- 眼睛：对 `index 0 / 1` 调 `projectEye(rig, pose, index)`，输出
  ```html
  <rect x="-4.2" y="-12.5" width="8.4" height="25" rx="4.2" transform="matrix(a b c d e f)" fill="<ink.eyes>"/>
  ```
  注意 `rect` 的坐标是**以眼睛中心为原点**，因为矩阵里已经含了平移。
- `working` 状态：沿用现有 `workingStyle` 的关键帧结构，但作用于身体组与眼睛组这两个 class。

- [ ] **Step 4: 跑测试**

Run: `pnpm vitest run packages/renderer-svg/test/render.test.ts && pnpm test`
Expected: 全绿；`rect` 的 24 组字节比对不变。

- [ ] **Step 5: 提交**

```bash
git add packages/renderer-svg
git commit -m "feat(svg): draw sphere-rig eyes"
```

---

### Task A4: 画廊里看得见

**Files:**
- Modify: `apps/gallery/src/App.tsx`, `apps/gallery/src/components/Wall.tsx`, `apps/gallery/src/components/DetailCard.tsx`, `apps/gallery/src/packs.ts`
- Create: `apps/gallery/src/packs/orb.ts`

**Interfaces:**
- Consumes: `buildGeometry`、`renderGeometry`。
- Produces: 画廊多一个 `orb` 包；详情卡多两个滑杆（yaw / pitch），拖动时重渲染。

- [ ] **Step 1: 新增演示包**

`apps/gallery/src/packs/orb.ts`：复用 organic-blob 的形状与配色，但声明球面眼睛（`sphereRadius 44`、`splitDeg 18`、两只胶囊 `halfWidth 4.2 / halfHeight 12.5`、`tiltDeg ∓6`）。`id: "orb"`、`version: "0.1.0"`、`clipByFamily` 与 organic-blob 相同。

- [ ] **Step 2: 画廊改用几何渲染**

`Wall` 与 `DetailCard` 从 `buildAvatarSpec` + `renderSvg` 改为 `buildGeometry` + `renderGeometry`。这是安全的：Task A3 已证明 `rect` 包两条路径**逐字节相同**。保留一条测试断言画廊两个包在 `rect` 下的渲染一致。

- [ ] **Step 3: 加注视滑杆**

详情卡增加两个 `<input type="range">`：yaw `-45..45`、pitch `-30..30`，默认 0。拖动时用 `{ ...geometry, pose: { ...geometry.pose, gaze: { yaw, pitch } } }` 重渲染。**这是"看得见"的核心**：拖一下就能看到远处那只眼睛变窄。

- [ ] **Step 4: 浏览器验证**

起 dev server，切到 `orb`，拖动 yaw 到 ±40，确认：

- 远处眼睛明显变窄、略斜
- pitch 到 ±20 时两眼倾斜
- 切回 `organic-blob`，观感与之前完全一致

截图存 `/tmp/m2-orb-gaze.png`（正视 / 右转 / 抬头 三张并排）。停掉服务。

- [ ] **Step 5: 提交**

```bash
git add apps/gallery
git commit -m "feat(gallery): an orb pack with a gaze slider"
```

---

## 阶段 B：能用（3 个任务，做完再评估）

### Task B1: 用 mask 把眼睛裁进身体

眼睛滑到边缘时会被轮廓裁掉，而不是露在外面（原型里 45° 那只眼睛已经跑到身体外）。用 `<clipPath>` 包住 `body.outline` 生成的路径，作用于眼睛组。测试断言：45° 时眼睛的绘制被裁且不产生大于身体的包围盒。

### Task B2: 转头带动身体

`SphereEyeRig` 增加 `bodyCoupling: number`（0–1，默认 0.3）：渲染器给身体组加 `rotate(yaw * bodyCoupling)`。理由：非圆形状上只让眼睛滑会顶边；圆球则可以设 0。

### Task B3: 形状相关的注视钳制

`buildGeometry` 计算该形状在水平方向上的可用半角（用轮廓在若干角度上的半径），超出时钳制 yaw，并把这个上界放进 `pose` 的元数据供 UI 显示滑杆范围。测试：星形与水滴的钳制角度小于圆形。

---

## 自审

**覆盖。** 阶段 A 的四步正好对应"看得见"的最小闭环：数学（A1）→ 入口（A2）→ 渲染（A3）→ 眼见（A4）。阶段 B 处理原型的两个缺陷：眼睛出界（B1）、只滑不转（B2），并给出角度上界（B3）。

**占位风险。** A2 的实现里用 `as unknown as` 读 `pack.eyes.kind` 是过渡手段，因为 v1 的 `EyeGeometry` 类型还没有球面成员。这不是偷懒：改 v1 类型会让现有 pack 与校验全部受影响，应该等阶段 B 结束时再一起收窄。实现时必须在代码注释里写明这一点。

**已知取舍。** A3 里球面分支不经过 `AvatarSpec`，等于渲染器有两条产线。这是必然的——`AvatarSpec` 的 `eyes: rect[]` 根本表达不了球面。等阶段 B 完成、`rect` 包可以迁移后，再考虑把 `renderSvg` 退役。
