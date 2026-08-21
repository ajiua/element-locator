// src/content/content.ts
// 监听 contextmenu 缓存目标元素；收到 GENERATE 消息后生成定位器并展示面板。

import { createDomEvaluator } from './validator';
import { ancestorChain, renderLocatorWithPick } from './render';

const CAPTURE_TTL_MS = 120_000;
let capturedChain: Element[] = [];
let capturedAt = 0;

document.addEventListener(
  'contextmenu',
  (e) => {
    if (e.target instanceof Element) {
      // 缓存从点击元素到 body 的整条祖先链，供面板里"选外层元素"时重新生成。
      capturedChain = ancestorChain(e.target);
      capturedAt = Date.now();
    }
  },
  true,
);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'GENERATE') return;
  try {
    const chain = capturedChain && Date.now() - capturedAt < CAPTURE_TTL_MS ? capturedChain : [];
    if (!chain.length) {
      sendResponse({ ok: false, error: '未捕获到目标元素，请先右键点击目标元素' });
      return;
    }
    renderLocatorWithPick(chain[0], createDomEvaluator(document), window);
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  return false;
});
