// src/devtools/devtools.ts
// 在 DevTools 里注册一个 "Element Locator" 面板。面板按钮通过 $0 读取 Elements 中选中的元素。

chrome.devtools.panels.create('Element Locator', '', 'panel.html', () => {});
