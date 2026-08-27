# 更新日志

本文件记录 Element Locator 的主要版本变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [未发布]

### 变更

- **破坏性（仅影响手工构造者）：** `FrameInfo.locatorPath` 现为必填字段。经 `generateLocator()` 消费的调用方不受影响；手工构造 `FrameInfo` 字面量的代码需补 `locatorPath: []`。

### 新增

- 库入口提供结构化且逐级验证通过的 iframe 定位路径：`FrameInfo.locatorPath` 按根到叶（最外层到最内层）顺序描述每一级 iframe，每级仅保留唯一命中目标的候选；原有人类可读的 `FrameInfo.path` 字段保持不变，自动化消费建议使用 `locatorPath`。
- 公开五个 Frame 相关类型：`FrameInfo`、`FrameLimitation`、`FramePathSegment`、`FrameSelectorCandidate`、`FrameSelectorKind`。
- 无法给出完整结构化路径时，通过 `FrameInfo.limitation` 明确标注原因：`'cross-origin'`（跨域无法访问祖先 frameElement）或 `'unlocatable'`（iframe 可访问但任一级产不出唯一命中的候选）；两种情况均不会返回不完整的 `locatorPath`。

## [1.0.0] - 2026-08-21

### 新增

- 生成并验证 XPath 和 CSS Selector 候选。
- 根据稳定性评分推荐唯一命中目标的定位器。
- 支持网页右键菜单和 DevTools `$0` 两种元素选取方式。
- 支持层级面包屑切换目标元素。
- 支持 iframe 信息和 open Shadow DOM 定位信息。
- 支持 Java 双引号转义和一键复制。
- 支持排除文本的结构化定位模式。
- 提供 `element-locator` 1.0.0 库入口；`npm run build` 继续按顺序生成扩展与库产物，保留原有扩展文件并承诺兼容该消费契约。

### 改进

- 过滤 hover、selected、active 等临时状态 class。
- 没有稳定目标属性时，从稳定祖先生成相对层级路径。
- 保留 `data-qa`、`data-cy` 等测试属性的真实名称。
- 链接定位采用查询参数和片段边界匹配。
- frame 消息发送失败时回退到主 frame。
