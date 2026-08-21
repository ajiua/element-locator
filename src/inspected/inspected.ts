// src/inspected/inspected.ts
// MAIN-world 注入脚本：暴露 `window.__elementLocatorGenerateAndShow(el)`，供 DevTools 面板通过
// chrome.devtools.inspectedWindow.eval('... $0 ...') 精准生成当前选中元素($0)的定位器。
// 独立于 content.js，运行在被检查页面（inspected page）的主世界。

import { createDomEvaluator } from '../content/validator';
import { renderLocatorWithPick } from '../content/render';

export interface GenerateOutcome {
  ok: boolean;
  error?: string;
}

function generateAndShow(el: Element): GenerateOutcome {
  try {
    if (!(el instanceof Element)) return { ok: false, error: '参数不是 DOM 元素' };
    renderLocatorWithPick(el, createDomEvaluator(document), window);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 挂到主世界窗口，供 devtools eval 调用。
(window as unknown as { __elementLocatorGenerateAndShow?: (el: Element) => GenerateOutcome }).__elementLocatorGenerateAndShow =
  generateAndShow;
