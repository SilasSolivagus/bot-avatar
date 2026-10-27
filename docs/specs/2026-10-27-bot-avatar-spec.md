# Bot Avatar — 规格书（Engine + Service + Gallery）

日期：2026-10-27　状态：待实现　来源：从 Rakazo/Shoalwork 的 `packages/core` 头像模块抽取并产品化

## 1. 一句话定义

**一个"身份 → 头像"的确定性生成引擎：算法只有一个，风格可以无限换。**

给定任意身份字符串（bot id、用户名、邮箱、任意 key），引擎产出同一份渲染规格：形状、配色、眼睛、动效。风格由可替换的 **Style Pack** 提供，换一个 pack 就换一种视觉语言，引擎一行不改。

## 2. 为什么不是"画头像"

- 不做 AI 生图，不做图库。头像**不存储**，只存身份；任何端都能用同一身份还原出同一张头像。
- 同一 `(pack, identity)` 必须产出字节一致的结果——这是全部设计的地基，也是服务端缓存的前提。
- 三种交付形态共用同一個引擎：**库**（1）、**HTTP 服务**（2）、**画廊**（3）。

## 3. 术语

| 术语 | 含义 |
| --- | --- |
| identity | 任意字符串，头像的唯一输入 |
| seed | identity 的稳定哈希（非负整数） |
| family | 形状家族序号，`seed % shapes.length` |
| look | 视觉上可区分的家族编号（部分家族长得一样，需归并） |
| pack | 风格包：形状集 + 调色板 + 眼睛规则 + 动效参数 |
| spec | 引擎输出：`AvatarSpec`，与渲染技术无关 |
| renderer | 把 spec 变成 SVG / Canvas / React Native 视图 |

## 4. 架构

```
identity ──hash──▶ seed ──▶ Engine(reads pack) ──▶ AvatarSpec
                                                    │
                        ┌───────────────────────────┼──────────────────────┐
                        ▼                           ▼                      ▼
                 renderer-svg                renderer-canvas         (future) RN
                        │                           │
                        └────────────┬──────────────┘
                                     ▼
                         library / HTTP service / gallery
```

四层职责必须严格分离：

1. **engine**：哈希、家族选择、look 归并、配色分配、旋转角。纯函数，零依赖，不碰 DOM/Node API。
2. **style pack**：纯数据 + 少量纯函数（轮廓点、调色板、眼睛几何、动效时长）。不 import engine 之外的东西。
3. **renderer**：把 spec 变成具体输出。只依赖 spec 类型。
4. **app**：service / gallery / 未来的编辑器。只依赖上面三层。

## 5. 核心契约（实现时以这些类型为准）

```ts
// engine/spec.ts
export interface PaletteColor {
  id: string;          // 稳定标识，用于池内去重
  name: string;        // 人类可读，如 "Emerald"
  light: string;       // 渐变起点，CSS 颜色
  dark: string;        // 渐变终点
  eye: string;         // 眼睛填充色
}

export interface ShapeFamily {
  /** 120×120 坐标系，原点在中心；闭合多边形，逆时针或顺时针均可 */
  outline: ReadonlyArray<readonly [number, number]>;
  /** 保留家族：新身份永远不会被分配到这里 */
  reserved?: boolean;
  /** 与另一个家族视觉等价时填写（用于去重计数） */
  look?: number;
}

export interface EyeGeometry {
  /** 每个眼睛的矩形/椭圆，坐标与 outline 同一空间 */
  eyes: ReadonlyArray<
    | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
    | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  >;
  /** 整组眼睛的旋转：seed % modulo - spread */
  rotation: { modulo: number; spread: number };
}

export interface StylePack {
  id: string;                 // "organic-blob"
  name: string;               // "Organic Blob"
  version: string;            // semver，改形状=次版本，改配色=修订版
  viewBox: string;            // 如 "-60 -60 120 120"
  shapes: readonly ShapeFamily[];
  palette: readonly PaletteColor[];
  eyes: EyeGeometry;
  motion: {
    /** 每个家族的循环时长，与 shapes 等长 */
    durationMsByFamily: readonly number[];
    /** 每个家族用哪套动作，与 shapes 等长；名字必须是 ClipName 之一 */
    clipByFamily: readonly ClipName[];
    /** 引擎提供的标准编排；pack 只决定时长与幅度倍数 */
    amplitude: number;
  };
  /** 新身份分配策略：是否按"最少使用"挑家族与配色 */
  assignment: "least-used" | "hash-only";
}

/** 动作库：六个整体动作 + 两个只动眼睛的动作 */
export type ClipName =
  | "breathe" | "bob" | "sway" | "bounce" | "tilt" | "shake"
  | "blink" | "look-round";

export interface AvatarSpec {
  packId: string;
  packVersion: string;
  identity: string;
  seed: number;
  family: number;
  look: number;
  color: PaletteColor;
  /** SVG path 的 d 属性；由 outline 生成，保证与 renderer 无关 */
  path: string;
  eyes: EyeGeometry["eyes"];
  eyeRotation: number;
  durationMs: number;
  /** 由 pack 的 clipByFamily[family] 决定 */
  clip: ClipName;
  motionAmplitude: number;
}
```

**引擎公开函数**（全部纯函数，可单测）：

```ts
export function avatarSeed(identity: string): number;
export function avatarFamily(seed: number, shapes: readonly ShapeFamily[]): number;
export function avatarLook(family: number, shapes: readonly ShapeFamily[]): number;
export function buildAvatarSpec(pack: StylePack, identity: string): AvatarSpec;
export function pickLeastUsed<T>(options: readonly T[], used: readonly T[], random: () => number): T;

/** 动作帧：五个通道始终齐全，渲染器不必判断 undefined */
export interface ClipFrame {
  translateY: number;
  scale: number;
  rotate: number;
  eyeScaleY: number;
  eyeOffsetX: number;
}
export function clipFrame(clip: ClipName, progress: number, amplitude: number): ClipFrame;
export const CLIP_NAMES: readonly ClipName[];
```

**渲染器契约**：

```ts
export interface AvatarRenderer<Out> {
  render(spec: AvatarSpec, options: { size: number; state?: "idle" | "working" }): Out;
}
// 首版只要求 svg：renderer-svg.render(spec, {size}) -> string
```

## 6. 不变量（必须由测试守住）

1. **确定性**：`buildAvatarSpec(pack, id)` 连续调用、跨进程、跨平台结果完全相等；不使用 `Date.now`、`Math.random`、`crypto.randomUUID`。
2. **稳定性**：pack 版本不变时，同一 identity 的输出字节不变（服务端 ETag 依赖此条）。
3. **保留家族不被分配**：`reserved: true` 的家族不出现在新身份的 `family` 里。
4. **look 归并**：`look` 相同的两个家族在"区分度"统计中算同一种长相。
5. **最少使用分配**：`assignment: "least-used"` 时，给定已有身份集合，新身份优先落在使用次数最少的家族与配色上。
6. **渲染器无状态**：同一个 spec 交给任何 renderer，形状/颜色/眼睛的数值必须一致。
7. **零品牌**：引擎、pack、spec 中不得出现任何上游品牌字符串（Rakazo / Shoalwork 都不出现在输出里）。

## 7. 仓库结构

```
packages/
  engine/              # 纯逻辑，零依赖
    src/seed.ts family.ts spec.ts assignment.ts
  style-packs/
    organic-blob/      # 首个风格包，抽取自上游 10 个模板
      src/shapes.ts palette.ts eyes.ts motion.ts index.ts
  renderer-svg/        # spec -> SVG 字符串
  renderer-canvas/     # 可选，M3
apps/
  service/             # HTTP 接口
  gallery/             # 浏览与调试
docs/
  spec/                # 本文件与 pack 作者指南
  packs/               # 每个 pack 的视觉说明
```

包命名（建议，待确认）：`@shoalwork/avatar-engine`、`@shoalwork/avatar-svg`、`@shoalwork/avatar-pack-organic-blob`；应用不发布。

## 8. 抽取映射（从上游仓库）

| 上游文件 | 去向 | 处理 |
| --- | --- | --- |
| `packages/core/src/avatar-shape.ts` | `engine/seed.ts` + `style-packs/organic-blob/src/shapes.ts` | 哈希/家族/归并留引擎；10 组点数组进 pack |
| `packages/core/src/bot-avatar-colors.ts` | `style-packs/organic-blob/src/palette.ts` | 去掉 `parseBotAvatarValue` 依赖，保留 id/name/light/dark/eye |
| `packages/core/src/avatar-motion.ts` | `engine/motion.ts` + pack 的 `durationMsByFamily` | 编排逻辑归引擎，时长归 pack |
| `packages/core/src/avatar-clips.ts` | `engine/clips.ts`（M2） | 首版可只做位移/缩放/旋转，不做完整 clip 库 |
| `packages/core/src/bot-avatar-life.ts` | 不进本仓库 | 依赖 bot 运行状态，属应用层 |
| `packages/db/src/bot-avatar-choice.ts` | `engine/assignment.ts` | 剥离 Prisma/CUID，只留纯选择逻辑与注入的 `Random` |
| `packages/ui-web/src/bot-avatar.tsx` | `renderer-svg` | 只取 SVG 结构：渐变、path、眼睛组、`viewBox` |
| 上游 4 个 avatar 测试 | `engine` 与 pack 的测试 | 改写成不依赖 React 的纯断言 |

抽取时必须保留上游 `LICENSE`（Apache-2.0）与署名，并在 README 说明衍生关系。

## 9. 库 API（交付 1）

```ts
import { organicBlob } from "@shoalwork/avatar-pack-organic-blob";
import { buildAvatarSpec } from "@shoalwork/avatar-engine";
import { renderSvg } from "@shoalwork/avatar-svg";

const spec = buildAvatarSpec(organicBlob, "bot_123");
const svg = renderSvg(spec, { size: 128 });          // 字符串
const animated = renderSvg(spec, { size: 128, state: "working" }); // 带 CSS 动画
```

要求：ESM only、无运行时依赖、能在 Node 与浏览器同构运行、类型完整。

## 10. HTTP 服务（交付 2）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/v1/packs` | 列出可用 pack（id、name、version、familyCount） |
| GET | `/v1/avatar/:identity.json?pack=organic-blob` | 返回 `AvatarSpec` |
| GET | `/v1/avatar/:identity.svg?pack=organic-blob&size=128&state=idle\|working` | 返回 SVG |
| GET | `/v1/avatar/:identity.png?pack=…&size=…` | PNG，M2 起，服务端栅格化 |
| GET | `/health` | `{ ok: true, packs: n }` |

约定：

- `identity` 做 URL 解码后长度限制 1–200 字符；空或超限返回 400。
- 未知 pack 返回 400 并列出可用 id；未知路由 404。
- 响应头：`Content-Type` 正确；`ETag` 是**不透明内容标签**——`"` + 16 位十六进制 + `"`，由「pack 内容哈希 + identity 哈希 + size + state」派生；`Cache-Control: public, max-age=31536000, immutable`。
  - ETag 中不出现任何 pack 或 identity 的原文，因此换行、引号、逗号这些能破坏头部的字符不可能出现——这是结构性保证，不是转义。
  - 缓存键必须含 size 与 state：同一身份的 64px 与 128px 是两份不同的字节。
  - `X-Avatar-Pack: <packId>@<packVersion>` 供人排查，**不参与**缓存判断：能影响行为的字段不给人读，给人读的字段不影响行为。
  - `If-None-Match` 命中时**不得**构建 spec、不得渲染 SVG，直接返回 304（缓存命中路径的成本应当只剩哈希）。
  - `If-None-Match` 需接受逗号分隔的列表、`*` 通配符与 `W/` 弱标签，比较不透明值。

### 10.1 pack 边界（结构性约束）

服务内部只允许持有 `ValidatedPack`；`parsePack(unknown) → ValidatedPack | PackError` 是唯一入口，未解析的 pack 不得进入路由。

- **入口解析**：`id`/`name`/`version` 为非空字符串；`id` 限安全字符集且不得含控制字符；`version` 限 semver。任一不满足即拒绝启动，错误须点名文件与字段。
- **启动穷举**：对 pack 的每个 `family × palette 条目 × {idle, working}` 渲染一次（`organic-blob` 为 10 × 11 × 2 = 220 次），断言输出不含 `NaN`/`undefined`/`Infinity` 且结构完整。这一域是有限的，因此可以穷举；超过 1,000 次渲染的 pack 退化为抽样，且必须在日志里声明"已抽样"，不得静默。
- **内容哈希**：`packContentHash` 用键排序的规范序列化计算，跨进程必须一致（要有测试）。它进入 ETag，因此改了包内容却忘记改版本号时缓存仍会失效——这条错误变得无法发生。
- 不记录 identity 明文到日志（可能是用户邮箱），只记其哈希前缀。
- 首版技术栈：Node 22 + Hono + `@hono/node-server`（与上游生态一致）；PNG 用 `sharp` 或 `resvg-js`，M2 再定。

## 11. 画廊（交付 3）

单页应用，四个区域：

1. **Pack 切换**：下拉选择风格包，实时重渲染。
2. **身份输入**：任意字符串，回车即生成；旁边给 5 个随机示例。
3. **对照墙**：N=40 个身份 × 当前 pack，标注 family/look/color，用于评估"是否撞脸"。
4. **单卡详情**：大图、spec 的 JSON、复制 SVG、下载 PNG、切换 idle/working。

URL 可复现：`/gallery?pack=organic-blob&ids=a,b,c&size=160`。技术栈：Vite + React + 直接依赖库（不走服务端），保证画廊能在没有服务时独立运行。

## 12. 验收标准

**引擎**
- `buildAvatarSpec` 对 1,000 个随机身份的 family 分布与 `shapes.length` 同阶（±20%）。
- 同 pack 下同一身份在 Node 与浏览器构建产物中输出相同（可用快照测试）。
- 保留家族分配次数为 0。

**库**
- ESM 打包产物 < 20KB（gzip，不含 pack 数据）。
- 无 `dependencies`；`peerDependencies` 为空。

**服务**
- 同一 URL 两次请求返回字节相同的 SVG，且 `ETag` 一致；`ETag` 是 16 位十六进制的含引号不透明串，不含 pack 或 identity 原文。
- `If-None-Match` 命中返回 304，且该路径**不构建 spec、不渲染**（以调用计数断言，不只看状态码）。
- 缓存命中路径（304）在 100 并发下 p95 < 50ms。1,000 并发是部署级指标：本机共享压测机上的数字不作为判据，须在独立压测机复现后记录。
- 未知 pack → 400；超长 identity（> 200 字符，按码点计）→ 400。
- 坏 pack 必须在启动时退出：缺字段、类型错、名字含控制字符，三者都要点名文件并以非零码退出。

**画廊**
- 切换 pack 不刷新页面即生效。
- 对照墙 40 个身份中，`look` 重复率 < 25%（用于验证分配策略）。

## 13. 里程碑

| 里程碑 | 内容 | 退出标准 |
| --- | --- | --- |
| M0 | 仓库骨架 + engine + organic-blob pack + renderer-svg + 测试 | 库可用，`buildAvatarSpec`/`renderSvg` 有测试与快照 |
| M1 | service（svg + json + packs + health） | 验收标准中的服务项通过 |
| M2 | gallery + PNG 渲染 + clips 动效 | 画廊可切换 pack，PNG 与 SVG 视觉一致 |
| M3 | 第二个风格包（证明"换风格不改引擎"） | 新增 pack 不修改 engine 任何文件 |

## 14. 非目标

- 不做 AI 生图、不做图库。用户上传图片**原样透传**（`imageUrl`），引擎不处理、不裁剪、不代理。
- 不存储头像图片；不引入数据库。
- 不在首版做"用户手动编辑形状"的编辑器（画廊只做浏览与调试）。
- 不绑定任何 UI 框架；不给 React 专供组件（渲染器返回字符串，React 由使用方自行包装）。

## 15. 待确认（开工前定，否则按建议执行）

| 决策 | 建议 | 影响 |
| --- | --- | --- |
| 许可证 | Apache-2.0（与上游一致，便于衍生） | 低 |
| npm scope | `@shoalwork/avatar-*`（已有域名与组织） | 中，改名成本高 |
| 服务技术栈 | Node + Hono | 低 |
| PNG 方案 | `resvg-js`（纯 Rust，无原生编译依赖） | 中，影响部署 |
| 第二个风格包方向 | 几何硬边（与有机团子形成对比） | 中，影响 M3 验收示例 |

## 16. 给实施会话的提示

- 先跑通 M0 的快照测试，再动服务与画廊；引擎一旦有快照，改 pack 不会误伤引擎。
- 从上游抽取时**不要**把 React 组件、Prisma 模型、bot 运行状态一起搬过来——它们在上游有价值，在这里是负担。
- 眼睛的坐标系最容易出错：上游 `viewBox` 是 `-60 -60 120 120`，眼睛是两条 7×24、圆角 3.5 的矩形，整组按 `seed % 9 - 4` 旋转。抽取时先把这三件事写成测试。
- 所有 pack 必须通过同一套 conformance 测试（第 6 节）；新增 pack 只需要新增数据与一个索引文件。

## 17. 拆什么：精确清单

抽取原则：**只搬"算"的部分，"显示"与"存储"留在宿主项目**。下表逐文件给出处置。

| 上游文件 | 处置 | 说明 |
| --- | --- | --- |
| `packages/core/src/avatar-shape.ts` | **搬** → `engine/seed.ts` + `style-packs/organic-blob/src/shapes.ts` | 哈希/家族/归并进引擎；10 组轮廓点进 pack。纯函数，无依赖 |
| `packages/core/src/bot-avatar-colors.ts` | **搬** → `style-packs/organic-blob/src/palette.ts` | 删掉 `parseBotAvatarValue` 的 import，只保留 id/name/light/dark/eyeColor |
| `packages/core/src/avatar-motion.ts` | **搬并改造** → `engine/motion.ts` | 去掉 `"worklet"` 指令；编排公式归引擎，时长归 pack。Reanimated 适配由宿主自己做 |
| `packages/core/src/avatar-clips.ts` | **搬**（M2）→ `engine/clips.ts` | 首版只做位移/缩放/旋转，完整 clip 库后置 |
| `packages/core/src/avatar-life.ts` | **不搬** | 依赖 bot 运行状态（`run-state`），属应用层 |
| `apps/mobile/components/bot-avatar.tsx` | **只搬几何** → `renderer-svg` | 保留 `Svg`/`G` 结构、`viewBox`、眼睛矩形、旋转公式；React 外壳留在宿主 |
| `packages/ui-web/src/bot-avatar.tsx` | **只搬几何** → `renderer-svg` | 同上；两份几何合并为一份，这是抽取的主要收益 |
| `packages/db/src/bot-avatar-choice.ts` | **搬并剥离** → `engine/assignment.ts` | 去掉 Prisma/CUID，只留 `pickLeastUsed` 与可注入的 `Random` |
| `packages/db/src/bot-avatar-balance*` | **搬** → `engine/distinctness.ts` | 用于"撞脸"统计，纯逻辑 |
| `packages/contracts/src/bot-avatar*.ts` | **搬成兼容层** → `compat/legacy.ts` | 保留对 `#8B5CF6`、`#8B5CF6::shape_3`、图片 URL/data URI 的解析，见第 18 节 |
| 上游 4 个 avatar 测试 | **改写** → `engine` 与 pack 的纯断言 | 去掉 React/运行时依赖 |

**必搬的只有约 6 个源文件**（shape、colors、motion、clips、choice、contracts 解析），其余是外壳。这也是"能拆"的底气：核心耦合只在 4 个点上（第 18 节）。

## 18. 让 Shoalwork 直接替换：四个耦合点与接管路径

上游的头像模型是**存储型**：bot 上存一个字符串，创建时分配，用户可在头像工作室里改颜色/形状/上传图片。新项目的模型是**派生型**：由身份算出。两者用 `override` 打通。

### 18.1 必须支持的兼容输入

```ts
export type AvatarOverride =
  | { colorId: string }                                  // "#8B5CF6" 或预设色 id
  | { colorId: string; shapeIndex: number }              // "#8B5CF6::shape_3"
  | { imageUrl: string };                                // https:// 或 data:image/...

export function parseLegacyAvatarValue(raw: string): AvatarOverride | null;

export function buildAvatarSpec(
  pack: StylePack,
  identity: string,
  override?: AvatarOverride,
): AvatarSpec;
```

规则：

- 有 `imageUrl` → 直接透传，引擎不生成图形（渲染器返回 `<image href>`）。
- 有 `shapeIndex` → 覆盖 `family`，但仍用 `look` 归并做区分度统计。
- 只有颜色 → `color` 取该色，形状仍由哈希决定。
- 无 override → 完全由身份派生。

### 18.2 接管四步（每步独立可验收）

| 步骤 | 做什么 | 验收 |
| --- | --- | --- |
| A 并行运行 | 宿主同时装旧渲染与新包，用真实 bot 数据跑对照 | 抽取 200 个真实头像值（含图片、含 `::shape_N`），新旧输出**逐字节一致**；有差异的列入白名单并说明原因 |
| B 切换渲染 | web 与 mobile 的组件改为调用新包，组件外壳保留 | 视觉回归截图零差异；`organic-blob` pack 的轮廓点必须与上游完全一致 |
| C 删除重复 | 删掉 web/mobile 两份几何，删除 `contracts` 里的旧解析（改由 `compat/legacy` 提供） | 全仓搜索 `organicAvatarPath` 只剩一处定义 |
| D 存储策略 | 新 bot 不写头像值（纯派生）；老 bot 保留原值作为 override | 新建 bot 的数据库记录里没有头像字段；老 bot 渲染不变 |

**A 步是不可跳过的门禁**：没有"200 个真实值逐字节一致"这条证据，B 步之后的所有视觉问题都会被误判成新包的 bug 或旧代码的 bug。

### 18.3 视觉一致性为何能成立

上游几何是**固定不动的常量**：10 组轮廓点、两个 7×24 圆角 3.5 的矩形眼睛、`rotate(seed % 9 - 4)`、`viewBox="-60 -60 120 120"`。只要 `organic-blob` pack 原样复制这些常量、`avatarSeed` 的字符串哈希算法一致（`hash = hash*31 + charCode` 同款），同一身份的输出必然一致。这是可以用快照锁死的，不需要靠肉眼。

### 18.4 宿主需要自己保留的东西

`avatar-life`（idle/working/thinking 状态机）、头像工作室 UI、Reanimated 动画适配、bot 数据读写。新项目只提供"值 → spec → SVG"，不接管状态与存储。

## 19. 任何用户怎么用：三种入口

### 19.1 库（三行接入）

```ts
import { organicBlob } from "@shoalwork/avatar-pack-organic-blob";
import { buildAvatarSpec, renderSvg } from "@shoalwork/avatar";

const svg = renderSvg(buildAvatarSpec(organicBlob, user.id), { size: 96 });
```

无需配置、无需注册、无需服务端；`user.id` 可以是邮箱、UUID、昵称，任意字符串。

### 19.2 自带风格包（任何人都能做自己的头像风格）

```ts
import type { StylePack } from "@shoalwork/avatar";

export const geometric: StylePack = {
  id: "geometric", name: "Geometric", version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes: [...],          // 任意轮廓点集
  palette: [...],         // 任意配色
  eyes: {...},            // 任意眼睛几何
  motion: {...},
  assignment: "least-used",
};
```

配套一个**一致性校验 CLI**，让第三方 pack 也能自证合规：

```bash
npx @shoalwork/avatar-conformance ./my-pack.ts
# 检查：确定性、分布、保留家族、look 归并、与渲染器一致；并输出一张对照图到 ./conformance.png
```

没有这个 CLI，"任何人都能调用"就只是一句口号——第三方无法知道自己做的 pack 对不对。

### 19.3 服务与画廊

```bash
npx @shoalwork/avatar-service --port 8787
# GET /v1/avatar/alice.svg?pack=organic-blob&size=128
npx @shoalwork/avatar-gallery --pack ./my-pack.ts
```

服务与画廊都必须支持 `--pack` 加载**本地风格包文件**，否则又变成只能看内置风格。

## 20. 新增验收标准

- **兼容性**：200 个真实旧头像值（含图片与 `::shape_N`）经 `parseLegacyAvatarValue` + `buildAvatarSpec` + `renderSvg` 后，与旧渲染逐字节一致；差异项列入 `docs/compat-deltas.md` 并逐条说明。
- **可替换性**：宿主完成第 18.2 的 A–D 后，全仓 `organicAvatarPath` 只剩一处定义；新建 bot 不写头像字段。
- **第三方可用性**：在空目录里 `npm i @shoalwork/avatar @shoalwork/avatar-pack-organic-blob`，按 19.1 三行代码能在 5 分钟内出图；`avatar-conformance` 对故意做成非确定性的 pack 必须报错。
- **pack 可加载**：服务与画廊都能通过 `--pack` 加载仓库外的 pack 文件并正常出图。
