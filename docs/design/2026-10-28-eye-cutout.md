# 眼睛是"抠洞"，但头像不透明

日期：2026-10-28　状态：决定
来源：xAI 设计文 + 线上 CSS（经 `grok-xai-design.md` 取证）

## 1. 参考实现到底怎么做的

```css
._2wE0bW_head { fill: var(--fg); }
._2wE0bW_eye  { fill: var(--bg); }
```

`--bg` 在挂载时绑定到所在表面（侧栏 / 面板 / 看板 / 纸面）的颜色。

关键细节：**眼睛不是真透明**。它们用表面色填充，并用同色描边加宽缝隙（`stroke: var(--bg); stroke-width: 6`）。因此：

- 头像**不透明**，可以压在图片上
- 眼睛在任何背景下都清楚，因为它的颜色**就是**背景色
- 不需要两套配色，深浅主题自动成立

## 2. 我们的决定

采纳"表面色填充"，不采纳真 mask 挖空。理由：

1. 参考实现就是这么做的，且明确为了"不透明可叠层"；
2. 真挖空会让 PNG 导出、叠在图片上、以及某些 SVG 渲染器出现意外；
3. 视觉上两者等价——只要传对了背景色。

## 3. 契约变化

```ts
// pack 声明眼睛用什么
interface SphereEyeRig {
  eyePaint?: "surface" | "ink";   // 默认 "ink"（保持现有包不变）
}

// 渲染时由调用方提供所在表面色
interface RenderOptions {
  surfaceColour?: string;          // eyePaint === "surface" 时必需
}
```

规则：

- `eyePaint === "surface"` 且未提供 `surfaceColour` → **抛错**，不做默认值。猜一个背景色会污染缓存（ETag 不含它）。
- 服务端 `?bg=` 参数映射到 `surfaceColour`；缺省且 pack 用 surface 时返回 400，消息说明需要 `bg`。
- 画廊把卡片的实际背景色传进去。

## 4. 我们自己的选择（非抄来的）

- 描边宽度：参考实现是 6（单位未说明，推测是 viewBox 单位）。我们按眼睛尺寸的 8% 取，写进 pack。
- 不引入主题令牌系统：我们只有一个 `surfaceColour` 参数，由宿主决定传什么。
