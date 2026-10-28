# 形状的构造：参考实现怎么做的

日期：2026-10-28　状态：证据 + 采纳决定
来源：`bloub` 的 `src/bot/skins.ts`、`src/bot/shape.ts`（MIT，逐帧还原 x.ai 头像）

## 1. 数据模型：64 个半径，不是多边形

```ts
// skins.ts
const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * Math.PI * 2)
export interface BotShape { id: ShapeId; radii: number[] }
```

`PROFILE_SAMPLES = 64`，固定角度采样。**所有形状共用同一组角度**，因此任意两个形状逐点对应，过渡 = 半径逐项线性插值，不需要路径变形库。

## 2. 生成器（shape.ts）

| 生成器 | 做法 | 用途 |
| --- | --- | --- |
| `superellipseProfile(n, sx, sy)` | `(|x/sx|^n + |y/sy|^n)^(-1/n)` 沿角度采样 | 方、宽/高团、椭圆类 |
| `regularPolygonProfile(sides, radius, rc, rotationDeg)` | 顶点放在 `radius − rc`，再做**半径为 rc 的 Minkowski 圆角** | 三角、六边 |
| `unionOfCirclesProfile(circles)` | 沿射线取"最远的圆交点"，即圆并集的径向轮廓 | 云朵 |
| `hullOfCircles(x1,y1,r1, x2,y2,r2)` | 两个圆的外公切包围凸包 | 胶囊、水滴 |
| 低频谐波叠加 | `1 + 0.075·cos(2a+0.5) + 0.035·cos(3a+2.1)` | 卵石 |

**关键：不规则度很小。** 卵石只有 7.5% + 3.5% 两个低次谐波。"有机"来自极小的扰动，不是大幅变形。

**关键：圆角是参数，不是平滑迭代。** 三角用 `rc = 0.34`，六边用 `rc = 0.26`，都是显式值；不是"多平滑几轮"。

## 3. 归一化：视觉重量一致

```ts
/** Ramene le rayon maximal a `max` pour que toutes les formes pesent pareil a l'oeil. */
function normalize(radii: number[], max = 1): number[] { /* 最大半径缩到 max */ }
```

各形状的归一化目标**不同**，源码给了理由：

| 形状 | 归一化目标 | 理由（原文/注释） |
| --- | --- | --- |
| 方 `squircle` | **1.15** | 超椭圆的最大半径在**对角线**上，按它归一化会让形状看起来比圆小 |
| 云 `nuage` | 1.02 | — |
| 卵石 `galet` | 1.02 | — |
| 水滴 `goutte` | 1.04 | — |
| 恒等 | 1.00 | — |

## 4. 形状清单：八个

`cercle`（圆）、`galet`（卵石）、`squircle`（方）、`capsule`（胶囊）、`triangle`（三角）、`hexagone`（六边）、`nuage`（云）、`goutte`（水滴）。

**没有星形，没有花生，没有多层挤出。**

## 5. 采纳决定

| 项 | 决定 |
| --- | --- |
| 数据模型 | 采纳 `radii[64]`，替换手绘 `outline: Point[]`（`rect` 老包保留 `outline` 路径不动） |
| 生成器 | 采纳五个：超椭圆、圆角正多边形、圆并集、两圆凸包、低频谐波 |
| 归一化 | 采纳，并按形状给补偿系数（方 1.15 等） |
| 形状数量 | 八个，与参考一致 |
| 星形 / 花生 / 挤出体 | **删除**——参考实现没有，且我们已验证星形放不下眼睛 |

## 6. 我们自己的选择（非抄来的）

- 形状的**具体参数值**（超椭圆指数、圆角半径、圆心布局）由我们自定，不照抄他们的数值。
- 配色：12 色结构参考他们（9 有彩 + 墨/灰/米），色相与色值自定。
- 眼睛：球面投影与胶囊端头是他们的机制；脸部参数"由轮廓最小半径推导"是我们的做法（他们没有自动推导，是逐形状手写锚点）。

## 7. 我们采用的参数值

`art` 包的八形状实现值。表中"参考"只指来自 `bloub` 的 `shape.ts` / `skins.ts` 并经 §2–§3 引用的机制或数值；标"我们的"是证据没有给出、由本项目选定的取舍。

所有归一化目标都是**系数**，实际最大半径 = `SHAPE_SCALE × 系数`。`SHAPE_SCALE = 46`（120 单位的 viewBox）是我们选的；系数本身按 §3。

| 形状 | 生成器调用 | 系数 | 实际最大半径 | 数值来源 |
| --- | --- | --- | --- | --- |
| 圆 | `superellipseProfile(2)` | 1.00 | 46.0 | 生成器与目标参考；指数 2 是圆的定义 |
| 卵石 | `harmonicProfile([{amplitude: 0.075, frequency: 2, phase: 0.5}, {amplitude: 0.035, frequency: 3, phase: 2.1}], 1)` | 1.02 | 46.9 | 7.5% / 3.5%、频率与相位参考；`base = 1` 我们的 |
| 方 | `superellipseProfile(4.2)` | **1.15** | 52.9 | 目标 1.15 参考；指数 4.2 我们的（证据只说"超椭圆"，未给指数） |
| 胶囊 | `hullOfCirclesProfile({x: 0, y: 20, r: 24}, {x: 0, y: -20, r: 24})` | 1.00 | 46.0 | 生成器与目标参考；圆心与半径我们的 |
| 三角 | `regularPolygonProfile(3, 1.12, 0.34, -90)` | 1.00 | 46.0 | 圆角 `0.34` 参考；`radius 1.12`、旋转 `-90°` 我们的 |
| 六边 | `regularPolygonProfile(6, 1.04, 0.26, 0)` | 1.00 | 46.0 | 圆角 `0.26` 参考；`radius 1.04`、旋转 `0°` 我们的 |
| 云 | `unionOfCirclesProfile` 五圆：`(-21, 5, 19)`、`(21, 5, 19)`、`(0, 14, 21)`、`(-11, -12, 17)`、`(13, -10, 16)` | 1.02 | 46.9 | 生成器与目标参考；五个圆心与半径我们的 |
| 水滴 | `hullOfCirclesProfile({x: 0, y: 10, r: 30}, {x: 0, y: -30, r: 9})` | 1.04 | 47.8 | 生成器与目标参考；圆心与半径我们的 |

其余参数：

- **十二色**：9 有彩 + 墨 / 灰 / 米的结构参考，所有色值是我们的。九个有彩色相的 `light` 取该色相在 OKLCH 明度下的 sRGB 色域上限的 98.5%，明度覆盖 0.48–0.86；墨的暗端明度 0.16，米的亮端 0.95。眼睛用 `#141414`，只有墨色身体改用米色 `#FBF3E4`，否则眼睛在近黑身体上不成立。
- **球面眼睛**：`sphereRadius 44`、`bodyCoupling 0.35`、`bodyPitchFollow 0.35`、`restTiltDeg -4`、`fadeFromDepth 0.12`、`cullAtDepth 0.02` 是我们的取值（与画廊其余球面包一致）。球面投影、胶囊眼和"尺寸由轮廓推导"的机制来自参考与 §6。
- **运动**：八条时长与八条 clip 是我们的取值；每个 family 一条，互不锁步。
- **分配**：`assignment: "hash-only"` 是我们的包约定，不是参考实现的配置项。
