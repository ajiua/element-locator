import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// inspected.ts 在模块加载时把 __elementLocatorGenerateAndShow 挂到 window（MAIN 世界注入）。
// 先 seed 浏览器全局再导入。
const dom = new JSDOM(
  '<!DOCTYPE html><html><body><button id="go">go</button></body></html>',
);
const win = dom.window;
(globalThis as Record<string, unknown>).window = win;
(globalThis as Record<string, unknown>).document = win.document;
(globalThis as Record<string, unknown>).Element = win.Element;

await import('../src/inspected/inspected');

const fn = (win as unknown as { __elementLocatorGenerateAndShow?: (el: unknown) => { ok: boolean; error?: string } })
  .__elementLocatorGenerateAndShow;
assert.ok(typeof fn === 'function', '__elementLocatorGenerateAndShow should be defined on window');

test('inspected: generating for a real element shows the floating panel', () => {
  const btn = win.document.querySelector('#go')!;
  const out = fn?.(btn);
  assert.ok(out, 'should return a result');
  assert.equal(out.ok, true);
  assert.ok(win.document.querySelector('#element-locator-host'), 'floating panel host should exist');
});

test('inspected: non-element argument returns ok:false', () => {
  const out = fn?.({});
  assert.ok(out);
  assert.equal(out.ok, false);
  assert.ok(typeof out.error === 'string' && out.error.length > 0);
});
