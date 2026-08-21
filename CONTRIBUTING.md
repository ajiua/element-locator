# 参与贡献

感谢你关注 Element Locator。欢迎通过 Issue 报告问题、提出建议，也欢迎提交 Pull Request。

## 报告问题

为了便于复现，请尽量提供：

- Chrome 或 Chromium 浏览器版本
- 扩展版本或对应提交
- 可公开访问的页面地址，或能复现问题的最小 HTML
- 目标元素的 HTML 片段
- 实际生成的 XPath / CSS Selector
- 期望结果和实际结果
- 是否涉及 iframe、Shadow DOM、动态 class 或动态文本

请勿提交包含账号、个人信息、令牌或业务敏感数据的页面内容。

## 本地开发

环境要求：Node.js 18 或更高版本。

```bash
npm install
npm run build
```

在 `chrome://extensions` 中开启开发者模式，然后加载项目根目录。开发期间可以运行：

```bash
npm run watch
```

## 修改原则

- 定位规则应保持跨网站通用，不为单个站点写死私有属性。
- 优先考虑定位器在交互状态变化后的稳定性，而不只考虑生成瞬间的唯一性。
- 不改变 closed Shadow DOM、跨域 iframe 等浏览器安全边界。
- 功能修改和缺陷修复应补充能够复现问题的自动化测试。
- 避免在同一个 Pull Request 中夹带无关重构或格式化。

## 提交前验证

```bash
npm run typecheck
npm test
npm run build
```

同时建议在真实 Chrome 中验证右键菜单、DevTools `$0`、复制按钮以及相关 iframe 或 Shadow DOM 场景。

## Pull Request

Pull Request 描述应说明：

- 修改解决了什么问题
- 采用了什么实现方式
- 新增或更新了哪些测试
- 手工验证了哪些浏览器场景
- 是否改变扩展权限、定位优先级或用户界面

提交即表示你同意按项目的 [MIT License](LICENSE) 发布所贡献的内容。
