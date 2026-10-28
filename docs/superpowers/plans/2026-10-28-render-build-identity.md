# 渲染器构建指纹进 ETag — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 ETag 反映"是哪一版渲染器画的"，这样改了眼睛/形状代码之后，已缓存一年的客户端会重新取图。

**Architecture:** 构建时对 `packages/engine/src` 与 `packages/renderer-svg/src` 的源码算一个指纹（排序后的路径 + 内容），用 tsup 的 `define` 注入成常量。运行时只读常量，绝不读磁盘——生产环境的 dist 里没有源码。开发/测试环境（vitest 直接跑源码）用兜底逻辑现场算，保证两边数值一致。

**Spec:** `docs/specs/2026-10-27-bot-avatar-spec.md` §10（ETag 组成）、§10.1（内容哈希的稳定性要求）；设计背景见 `docs/design/2026-10-28-contract-v2.md` §10。

## 全局约束

- 指纹只覆盖**渲染相关源码**：`packages/engine/src/**`、`packages/renderer-svg/src/**`。`*.test.ts` 不算。
- 不覆盖 `apps/service/src`：改日志不该让全网缓存失效。
- 不覆盖 pack 数据：那部分已由 `packContentHash` 负责。
- 指纹必须**跨进程、跨机器**稳定：只依赖文件相对路径与内容，按路径排序后哈希；不读 mtime、不读 git、不读环境变量。
- 运行时不得读磁盘判断指纹（生产 dist 无源码）。
- 现有 ETag 语义不变：仍是 `"` + 16 位小写十六进制 + `"`。

## 结构

```
scripts/render-build.mjs           计算指纹（node 直接跑，供构建与测试共用）
apps/service/tsup.config.ts        define: { __RENDER_BUILD__: "<8 hex>" }
apps/service/src/build-id.ts       导出 RENDER_BUILD（构建期注入或开发期兜底）
apps/service/src/tag.ts            avatarTag 增加 renderBuild 输入
apps/service/src/app.ts            响应头增加 X-Avatar-Build；/health 带上它
apps/service/test/build-id.test.ts 指纹稳定性
apps/service/test/tag.test.ts      标签随指纹变化
```

---

### Task 1: 指纹计算脚本

**Files:**
- Create: `scripts/render-build.mjs`, `scripts/render-build.test.mjs`

**Interfaces:**
- Produces: `renderBuildFingerprint(rootDir: string): string` — 16 位小写十六进制（与 ETag 同一格式，便于人读）；CLI 形式 `node scripts/render-build.mjs` 打印指纹。

- [ ] **Step 1: 写失败的测试**

`scripts/render-build.test.mjs`（用 `node --test` 跑，避免把工程脚本塞进 vitest 的包测试里）：
```js
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { renderBuildFingerprint } from "./render-build.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "render-build-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("is stable for the same tree", () => {
  const root = fixture({ "engine/src/a.ts": "export const a = 1;\n" });
  assert.equal(renderBuildFingerprint(root), renderBuildFingerprint(root));
});

test("changes when a source file changes", () => {
  const one = fixture({ "engine/src/a.ts": "export const a = 1;\n" });
  const two = fixture({ "engine/src/a.ts": "export const a = 2;\n" });
  assert.notEqual(renderBuildFingerprint(one), renderBuildFingerprint(two));
});

test("ignores test files and unrelated directories", () => {
  const base = fixture({ "engine/src/a.ts": "export const a = 1;\n" });
  const withNoise = fixture({
    "engine/src/a.ts": "export const a = 1;\n",
    "engine/src/a.test.ts": "// no\n",
    "app/src/main.ts": "// not rendered\n",
  });
  assert.equal(renderBuildFingerprint(base), renderBuildFingerprint(withNoise));
});

test("is independent of file creation order", () => {
  const one = fixture({ "engine/src/a.ts": "A", "renderer/src/b.ts": "B" });
  const two = fixture({ "renderer/src/b.ts": "B", "engine/src/a.ts": "A" });
  assert.equal(renderBuildFingerprint(one), renderBuildFingerprint(two));
});
```

- [ ] **Step 2: 跑失败**

Run: `node --test scripts/render-build.test.mjs`
Expected: FAIL — 无法解析 `./render-build.mjs`。

- [ ] **Step 3: 实现**

`scripts/render-build.mjs`:
```js
#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCES = ["packages/engine/src", "packages/renderer-svg/src"];
const IGNORED = /\.test\.[cm]?[jt]sx?$/;

/** 只依赖相对路径与内容：不读 mtime、不读 git、不读环境。 */
export function renderBuildFingerprint(rootDir) {
  const hash = createHash("sha256");
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!IGNORED.test(entry.name)) files.push(full);
    }
  };
  for (const source of SOURCES) walk(join(rootDir, source));
  files.sort((a, b) => relative(rootDir, a).localeCompare(relative(rootDir, b)));
  for (const file of files) {
    hash.update(relative(rootDir, file));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.argv[2] ?? process.cwd();
  process.stdout.write(`${renderBuildFingerprint(root)}\n`);
}
```

- [ ] **Step 4: 跑测试**

Run: `node --test scripts/render-build.test.mjs`
Expected: PASS — 4 tests。

- [ ] **Step 5: 对真实仓库跑一次**

Run: `node scripts/render-build.mjs . && node scripts/render-build.mjs .`
Expected: 两次输出相同的 16 位十六进制。

- [ ] **Step 6: 提交**

```bash
git add scripts
git commit -m "build: fingerprint the rendering sources"
```

---

### Task 2: 构建期注入

**Files:**
- Create: `apps/service/src/build-id.ts`, `apps/service/tsup.config.ts`
- Modify: `apps/service/package.json`

**Interfaces:**
- Consumes: `renderBuildFingerprint`（构建期）。
- Produces: `RENDER_BUILD: string` — 生产环境是注入的常量，开发环境现场计算。

- [ ] **Step 1: 写失败的测试**

`apps/service/test/build-id.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { RENDER_BUILD } from "../src/build-id.js";

describe("RENDER_BUILD", () => {
  it("is 16 lowercase hex", () => {
    expect(RENDER_BUILD).toMatch(/^[0-9a-f]{16}$/);
  });

  it("matches the fingerprint of the current tree", async () => {
    const { renderBuildFingerprint } = await import("../../../../scripts/render-build.mjs");
    const root = new URL("../../../..", import.meta.url).pathname;
    expect(RENDER_BUILD).toBe(renderBuildFingerprint(root));
  });
});
```

第二条测试是这段代码的核心：**注入值必须和现场计算一致**，否则构建产物与开发环境的 ETag 会不同步。

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run apps/service/test/build-id.test.ts`
Expected: FAIL — 无法解析 `../src/build-id.js`。

- [ ] **Step 3: 实现**

`apps/service/src/build-id.ts`:
```ts
/**
 * 渲染器构建指纹。构建时由 tsup 的 define 注入；在 vitest 直接跑源码时，
 * 它退回到现场计算，保证两种环境数值一致。
 */
declare const __RENDER_BUILD__: string | undefined;

export const RENDER_BUILD: string =
  typeof __RENDER_BUILD__ === "string" ? __RENDER_BUILD__ : devFingerprint();

function devFingerprint(): string {
  // 只有开发/测试会走到这里；生产 dist 里源码不存在，注入值一定存在。
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  void createHash;
  return "0000000000000000";
}
```

上面的 `devFingerprint` 是故意留的占位实现，**不要就这样提交**。正确做法：把 `renderBuildFingerprint` 从 `scripts/render-build.mjs` 抽出成 `scripts/render-build-lib.mjs`（纯函数，无 CLI 副作用），`build-id.ts` 用 `createRequire` 在开发环境动态 `require` 它：

```ts
import { createRequire } from "node:module";

function devFingerprint(): string {
  const require = createRequire(import.meta.url);
  const { renderBuildFingerprint } = require("../../../../scripts/render-build-lib.mjs") as {
    renderBuildFingerprint: (root: string) => string;
  };
  return renderBuildFingerprint(new URL("../../../..", import.meta.url).pathname);
}
```
`render-build.mjs` 变成 `render-build-lib.mjs` 的薄 CLI 包装。

`apps/service/tsup.config.ts`:
```ts
import { renderBuildFingerprint } from "../../scripts/render-build-lib.mjs";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/pack-hash.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  define: { __RENDER_BUILD__: JSON.stringify(renderBuildFingerprint(process.cwd() + "/../..")) },
});
```

`apps/service/package.json` 的 build 脚本改成走配置：`"build": "tsup"`。

- [ ] **Step 4: 验证注入真的发生**

Run:
```bash
pnpm build
grep -o "__RENDER_BUILD__" apps/service/dist/index.js | head -1   # 期望：无输出
node -e "import('./apps/service/dist/build-id.js').then(m => console.log(m.RENDER_BUILD))"
```
Expected: 第二行打印 16 位十六进制；第一行没有 `__RENDER_BUILD__` 残留（说明已被替换）。

- [ ] **Step 5: 跑测试**

Run: `pnpm vitest run apps/service/test/build-id.test.ts`
Expected: PASS — 两条，且注入值与现场计算一致。

- [ ] **Step 6: 提交**

```bash
git add apps/service scripts
git commit -m "build(service): inject the render fingerprint at build time"
```

---

### Task 3: 指纹进 ETag

**Files:**
- Modify: `apps/service/src/tag.ts`, `apps/service/src/app.ts`, `apps/service/test/tag.test.ts`, `apps/service/test/app.test.ts`

**Interfaces:**
- Consumes: `RENDER_BUILD`。
- Produces: `avatarTag({ packHash, identity, size, state, renderBuild })`；`X-Avatar-Build: <指纹>` 响应头；`/health` 返回 `renderBuild`。

- [ ] **Step 1: 写失败的测试**

`apps/service/test/tag.test.ts` 追加：
```ts
describe("render build in the tag", () => {
  const base = { packHash: "a".repeat(64), identity: "alice", size: 128, state: "idle", renderBuild: "0123456789abcdef" };

  it("changes when the renderer build changes", () => {
    expect(avatarTag({ ...base, renderBuild: "fedcba9876543210" })).not.toBe(avatarTag(base));
  });

  it("stays a quoted 16 hex string", () => {
    expect(avatarTag(base)).toMatch(/^"[0-9a-f]{16}"$/);
  });
});
```

`apps/service/test/app.test.ts` 追加：
```ts
describe("render build is observable", () => {
  it("reports the build on health and on avatar responses", async () => {
    const health = (await (await app.request("/health")).json()) as { renderBuild: string };
    expect(health.renderBuild).toMatch(/^[0-9a-f]{16}$/);
    const res = await app.request("/v1/avatar/alice.svg");
    expect(res.headers.get("x-avatar-build")).toBe(health.renderBuild);
  });
});
```

- [ ] **Step 2: 跑失败**

Run: `pnpm vitest run apps/service/test/tag.test.ts apps/service/test/app.test.ts -t "build"`
Expected: FAIL — 参数不认识、头部与 `/health` 字段不存在。

- [ ] **Step 3: 实现**

`tag.ts`：`TagInput` 增加 `renderBuild: string`，哈希输入串变成 `${packHash}|${identityHash(identity)}|${size}|${state}|${renderBuild}`。

`app.ts`：所有头像响应（svg/json/png、200 与 304）都带 `"X-Avatar-Build": RENDER_BUILD`；`/health` 返回 `{ ok: true, packs: n, renderBuild: RENDER_BUILD }`。

- [ ] **Step 4: 跑测试与整套**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿；原有 ETag 断言（16 位十六进制）仍然成立。

- [ ] **Step 5: 提交**

```bash
git add apps/service
git commit -m "feat(service): cache-bust when the renderer changes"
```

---

### Task 4: 文档与验证

**Files:**
- Modify: `README.md`, `docs/m1-benchmark.md`（只加一节说明，不改历史数字）

- [ ] **Step 1: 说明这条不变式**

README 的 HTTP 服务一节补一段：ETag 现在由「包内容 + 身份 + 尺寸 + 状态 + 渲染器构建指纹」决定；因此**升级渲染代码会让所有头像缓存失效一次**，这是有意的；`X-Avatar-Build` 用来看当前是哪一版。

- [ ] **Step 2: 实证一次**

Run:
```bash
pnpm build
node apps/service/dist/cli.js --port 8796 &
sleep 1
ETAG1=$(curl -sI 'http://127.0.0.1:8796/v1/avatar/alice.svg' | tr -d '\r' | awk -F': ' '/^etag/{print $2}')
kill %1
# 改一行渲染器源码（例如给某个注释加一个字），重新构建
pnpm build
node apps/service/dist/cli.js --port 8796 &
sleep 1
ETAG2=$(curl -sI 'http://127.0.0.1:8796/v1/avatar/alice.svg' | tr -d '\r' | awk -F': ' '/^etag/{print $2}')
kill %1
echo "$ETAG1"; echo "$ETAG2"
```
Expected: 两个 ETag **不同**，且响应字节确实不同（若渲染输出未变，第二个 ETag 仍应不同，因为我们按源码而不是输出算指纹——这是有意的保守选择）。把这一步的输出写进报告。

- [ ] **Step 3: 提交**

```bash
git add README.md docs
git commit -m "docs: explain the render fingerprint in the cache key"
```

---

## 自审

**覆盖。** 目标：改渲染器 → 缓存失效（Task 3 的测试与 Task 4 的实证）。稳定性：跨进程一致（Task 1 的创建顺序测试 + Task 2 的注入值与现场值比对）。范围：不含测试文件、不含 `apps/service/src`（Task 1 的忽略测试）。运行时零磁盘读取：`build-id.ts` 生产走注入分支（Task 2 Step 4 用 `grep` 验证没有残留占位符）。

**占位风险。** Task 2 Step 3 里我故意先写了一个假实现再纠正——这是**计划本身的缺陷**，实现时应直接写最终版本（`createRequire` 动态加载 lib），不要先提交假实现。计划保留这段是为了说明"为什么不能用 `require` 直接写"：tsup 产物是 ESM，`require` 不存在，必须 `createRequire`。

**已知取舍。** 指纹按**源码**算，不按输出算。好处是构建期就能定、不依赖运行；坏处是改一行注释也会让全网缓存失效一次。这是保守方向上的错误——宁可多失效一次，也不要出现"改了代码用户看不到"。如果以后嫌频繁，可以把注释剥离后再哈希，但不要改成按输出哈希（那需要每次请求都渲染才能判断）。

**未做。** 指针跟随（`gaze` 随鼠标）不在本计划内：那是**客户端层**能力，需要 JS 驱动重渲染，服务端只能提供 `?gaze=yaw,pitch` 的静态变体。等 v2 契约落地、渲染器支持 `pose` 之后再做。
