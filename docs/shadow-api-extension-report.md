# Shadow API 扩展报告

日期：2026-08-24

## 范围

仅修改 `element-locator`；未修改 Flow Forge，未创建 Git commit。

## API 设计

- 新增公开类型 `ShadowSelectorKind`：`css`、`document-relative-xpath`、`document-absolute-xpath`、`shadow-root-relative-xpath`。
- 新增 `ShadowCandidate`（`selector`、`kind`、可选 `validation`）和 `ShadowCandidates`（`xpath` / `css`）。
- `ShadowInfo` 新增稳定的 `hostCandidates`、`innerCandidates` 空值形状；保留旧的 `hostXPath`、`hostCss`、`innerXPath`、`innerCss` 原始字段以保持兼容。
- `detectShadow()` 仅发现并生成候选，不把原始字符串当作验证后的结果。
- `generateLocator()` 负责验证：host 使用调用方 `Evaluator` 相对其所属 document 验证；open Shadow 的 inner CSS/XPath 相对 ShadowRoot 验证。inner XPath 以 `.${xpath}` 作为 XPath 上下文表达式，因此旧的 `/button[1]` 仍表示 ShadowRoot 的直接子元素，而非 document absolute XPath。
- closed Shadow 仅验证可访问的 host 候选，跳过 inner 候选验证。
- `src/library/index.ts` 从根入口导出全部新增 Shadow 类型，消费者无需深层导入。

## TDD 记录

### RED

先在 `tests/library-api.test.ts` 新增 open Shadow 专项测试：断言 host 与 inner 的 CSS/XPath 候选都有 `unique` / `matchesTarget: true` 验证；断言 inner `/button[1]` 的类型为 `shadow-root-relative-xpath`，并非 `document-absolute-xpath`。另加入 closed Shadow 不验证 inner 候选的边界测试。

命令：

```text
node --experimental-loader ./scripts/css-loader.mjs --import tsx --test --test-concurrency=1 tests/library-api.test.ts
```

首次输出（预期 RED）：4 个子测试中 3 通过、1 失败。新增测试报：

```text
TypeError: Cannot read properties of undefined (reading 'xpath')
```

失败位置为 `result.shadow.hostCandidates.xpath`，原因是候选 API 尚未实现，符合预期。

### GREEN

最小实现后运行：

```text
node --experimental-loader ./scripts/css-loader.mjs --import tsx --test --test-concurrency=1 tests/library-api.test.ts tests/shadow.test.ts
```

输出：7/7 通过，0 失败。覆盖公开入口、open Shadow 四类候选、closed Shadow 跳过内部验证，以及旧 `detectShadow()` 原始字段兼容。

### 集成类型检查

第一次 `npm run typecheck` 失败，唯一错误为 `tests/panel.test.ts` 的 `minimalResult()` 旧 `ShadowInfo` fixture 缺少新必填 `hostCandidates` / `innerCandidates`。已定位所有 `ShadowInfo` 构造位置并确认生产实现已有稳定空值形状；仅为该非 Shadow fixture 补入相同的空候选形状。复跑通过。

## 最终验证输出

```text
npm run typecheck
> tsc --noEmit
exit 0

npm run build
> npm run build:extension && npm run build:library
扩展构建完成；dist/library/index.js 生成完成；exit 0

npm test
> node --experimental-loader ./scripts/css-loader.mjs --import tsx --test --test-concurrency=1 ...
完整测试套件完成；exit 0
```

额外检查：`dist/library/index.d.ts` 已从根入口导出 `ShadowCandidate`、`ShadowCandidates`、`ShadowInfo`、`ShadowSelectorKind`；`git diff --check` 未报告补丁空白错误。

## 关注点

- `document-absolute-xpath` 是显式可过滤的类型值；本次现有 host 生成器产生的是 `document-relative-xpath`。
- Shadow DOM 多层遍历继续保留既有 `ShadowInfo` 原始字段语义；验证上下文与最终发现的 host/inner 对齐。
