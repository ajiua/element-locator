# 更新日志

本文件记录 Element Locator 的主要版本变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
