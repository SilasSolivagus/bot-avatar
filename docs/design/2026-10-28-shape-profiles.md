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
