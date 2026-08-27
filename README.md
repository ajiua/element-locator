# Element Locator

[简体中文](README.md) | [English](README_EN.md)

Element Locator 是一款 Chrome 扩展，用于为网页元素生成并验证稳定、唯一的 XPath 与 CSS Selector。它适用于自动化测试、网页调试和数据采集等需要可靠元素定位的场景。

## 功能亮点

- 同时生成 XPath 和 CSS Selector，并验证是否唯一命中目标元素
- 根据稳定性为多个候选定位器评分并推荐最优结果
- 支持网页右键和 DevTools `$0` 两种选取方式
- 支持 iframe 信息识别和 open Shadow DOM 定位信息
- 库产物提供逐级验证的结构化 iframe 定位路径（`locatorPath`），自动化流程可直接消费
- 自动过滤 `hover`、`active`、`selected` 等临时状态 class
- 目标缺少稳定属性时，可使用稳定祖先生成相对层级路径
- 提供纯结构定位模式，避免依赖容易变化的文本
- 支持 Java 字符串双引号转义和一键复制

## 截图

项目截图将在界面进一步稳定后补充。当前可按照下方步骤在 Chrome 开发者模式中直接体验。

## 安装

### 从源码构建

环境要求：Node.js 18 或更高版本、Chrome 或其他 Chromium 内核浏览器。

```bash
npm install
npm run build
```

随后在 Chrome 中安装：

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目根目录，而不是 `dist` 目录。

修改源码后执行 `npm run build`，并在扩展管理页点击刷新按钮。

### 本地库使用

本项目同时提供可供其他项目使用的本地库产物。先构建库：

```powershell
# 在本项目根目录执行
npm run build:library
```

业务代码唯一支持从公开入口导入：

```ts
import {
  createDomEvaluator,
  generateLocator,
  type FrameInfo,
  type FrameLimitation,
  type FramePathSegment,
  type FrameSelectorCandidate,
  type FrameSelectorKind,
  type LocatorResult,
} from 'element-locator';
```

使用方应通过本地 `file:` 依赖安装该包。不能导入 extension bundle，也不能依赖未导出的内部路径；库只提供 DOM 定位器生成能力。

#### 结构化 iframe 定位路径

当目标元素位于 iframe 中时，`result.frame.locatorPath` 会给出逐级定位 iframe 的结构化路径：

```ts
const result = generateLocator(element, createDomEvaluator(document), window);

for (const segment of result.frame.locatorPath) {
  console.log(segment.preferred.kind, segment.preferred.selector);
}

if (result.frame.limitation) {
  console.warn(result.frame.limitation);
}
```

语义约定：

- `locatorPath` 按**最外层到最内层**排序（根到叶）。
- 每一级只包含**唯一且命中该级 iframe** 的已验证候选。
- `preferred` 是该级**分数最高的已验证候选，同分时 CSS 排在 XPath 前**。因此带稳定 `id` 的 iframe，其 preferred 通常是 XPath 形式 `"//iframe[@id='…']"`（105 分，含 tagExact 加成），而不是 CSS `#…`（100 分）；不要假设 preferred 总是 CSS。
- 任一级产不出唯一命中的候选、或因跨域无法访问祖先 frameElement 时，**不会输出半条路径**：此时 `locatorPath` 为空数组并设置 `limitation`。
- `path` 是人类可读提示；自动化流程应消费 `locatorPath`。

## 使用方法

### 网页右键生成

1. 在网页中右键点击目标元素。
2. 选择 **Generate Element Locator**。
3. 在页面右下角查看推荐的 XPath 和 CSS Selector。
4. 必要时通过顶部面包屑切换到目标元素的外层节点。
5. 点击复制按钮取得定位器。

面板提供两个可选设置：

- **Java 双引号转义**：复制时把 `"` 转义为 `\"`。
- **结构化定位**：排除文本候选，优先使用 `href` 或祖先层级结构，适合文本经常变化的页面。

### 通过 DevTools 精准生成

1. 打开 Chrome DevTools。
2. 在 **Elements** 面板中选中目标元素，使其成为 `$0`。
3. 切换到 **Element Locator** 面板。
4. 点击“生成定位器（$0）”。
5. 在网页浮层中查看、切换层级并复制结果。

## 定位策略

Element Locator 会组合元素自身属性、文本、稳定祖先和 DOM 结构生成候选，然后在当前页面中验证候选是否唯一且命中目标。

优先使用的通用信息包括：

- 稳定的 `id`
- `data-testid`、`data-test`、`data-qa`、`data-cy` 等测试属性
- `name`、ARIA 属性和可靠的 `data-*` 属性
- 非临时语义 class
- 链接的 `href`
- 稳定祖先作用域内的文本或层级路径

扩展不会把 `unselct`、`unselect`、`hover`、`active` 等交互状态 class 当作可靠依据，也不会针对某个网站写死 `num` 一类私有属性。

当目标没有稳定属性时，可能生成类似以下路径：

```xpath
//div[@id='show']/ul[1]/li[1]
```

```css
#show > ul:nth-child(1) > li:nth-child(1)
```

此类路径不依赖鼠标状态，但列表插入、删除或重新排序后仍可能发生变化。

## 开发

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建扩展到 `dist/` |
| `npm run watch` | 首次构建后持续监听源码变化 |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm test` | 运行自动化测试 |

主要目录：

```text
src/
├─ background/   # 右键菜单和 frame 消息路由
├─ content/      # 定位器生成、验证、评分和网页浮层
├─ devtools/     # DevTools 面板
└─ inspected/    # DevTools $0 页面注入入口
tests/           # node:test + jsdom 自动化测试
scripts/         # esbuild 构建脚本
dist/            # 构建产物，不提交到仓库
```

## 浏览器验证建议

自动化测试覆盖候选生成、CSS 验证、评分、iframe 路由、构建入口和面板交互。发布前还建议在真实 Chrome 页面中检查：

- 有稳定 id、test-id 或 name 的普通元素
- 页面中存在多个相同文本的元素
- 文本频繁变化的元素和结构化模式
- iframe 中的元素
- open 和 closed Shadow DOM 场景
- Java 转义、复制按钮和层级面包屑
- DevTools 中通过 `$0` 生成定位器

## 已知限制

- closed Shadow DOM 无法从外部穿透，扩展只提供受限提示。
- 跨域 iframe 无法读取父页面中的完整 frame 元素信息，只能提供可访问的信息；此时结构化路径不可用，`frame.limitation` 为 `'cross-origin'`。
- iframe 可访问但任一级产不出唯一命中的候选时，`frame.limitation` 为 `'unlocatable'`。两种受限情况都不会返回不完整的 `locatorPath`（此时 `locatorPath` 为空数组）。
- 结构化路径段的候选只有 `css` 与 `xpath` 两种：XPath 侧排除了绝对路径，CSS 侧可能包含从 html 根出发的结构链（如 `html > body:nth-child(2) > iframe:nth-child(1)`），这是有意行为。
- 纯位置路径会受 DOM 插入、删除和排序影响。
- XPath 的完整行为需要在真实浏览器中验证；jsdom 测试环境无法等价覆盖所有浏览器实现。

## 隐私

当前实现不会把页面内容、定位器或浏览记录上传到服务器，也不包含遥测或分析代码。定位器在当前浏览器页面内生成和验证。

为了在网页和 iframe 中选取元素，扩展会在访问的页面中运行内容脚本。安装前可在 [`manifest.json`](manifest.json) 中查看所需权限和页面匹配范围。

## 参与贡献

提交 Issue 或 Pull Request 前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。版本变化记录见 [`CHANGELOG.md`](CHANGELOG.md)。

## 许可证

本项目采用 [MIT License](LICENSE)，版权归 ajiua 所有。
