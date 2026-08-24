import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { showPanel, hidePanel } from '../src/content/panel';
import type { LocatorResult, Candidate } from '../src/content/types';

function uniqueCandidate(selector: string, reason: string): Candidate {
  return {
    selector,
    kind: 'id',
    score: 80,
    reason,
    parentContext: false,
    tagExact: false,
    validation: { status: 'unique', count: 1, matchesTarget: true },
  };
}

function minimalResult(partial?: Partial<LocatorResult['frame']>): LocatorResult {
  const xpathBest = uniqueCandidate("//*[@id='q']", 'id: q');
  const cssBest = uniqueCandidate('#q', 'id: q');
  return {
    target: { tag: 'button', text: '查询 >> "<script>x</script>', id: 'q', classes: [] },
    frame: { inFrame: false, path: '', url: '', sameOrigin: true, ...partial },
    shadow: {
      inside: false,
      closed: false,
      depth: 0,
      hostCandidates: { xpath: null, css: null },
      innerCandidates: { xpath: null, css: null },
      hostTag: '',
      hostXPath: null,
      hostCss: null,
      innerXPath: null,
      innerCss: null,
    },
    xpath: { best: xpathBest, all: [xpathBest] },
    css: { best: cssBest, all: [cssBest] },
  };
}

// jsdom 支持 open shadow root；clipboard 仅在点击复制时触发，这里垫底以防意外触发。
let restoreClipboard: (() => void) | null = null;

function stubClipboard(): void {
  const nav = globalThis.navigator as { clipboard?: unknown };
  restoreClipboard = () => {
    if (nav) delete (nav as { clipboard?: unknown }).clipboard;
  };
  Object.defineProperty(nav, 'clipboard', {
    value: { writeText: async () => {} },
    configurable: true,
  });
  document.execCommand = () => true;
}

test('showPanel renders into host with best selectors', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  (globalThis as unknown as { window: unknown }).window = dom.window;
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  stubClipboard();

  // 清掉其它测试（如 content 的 GENERATE→showPanel）遗留的模块级 host，确保重新挂载。
  hidePanel();
  showPanel(minimalResult());

  const host = dom.window.document.querySelector('#element-locator-host');
  assert.ok(host, '#element-locator-host should exist');
  const shadow = host!.shadowRoot;
  assert.ok(shadow, 'shadow root should be open');
  const html = shadow!.innerHTML;
  assert.match(html, /Element Locator/);
  assert.match(html, /\/\/\*\[@id='q'\]/);
  assert.match(html, /#q/);
  // 动态注入的危险文本应被 HTML 转义（<script> 不得原样出现）。
  assert.ok(!html.includes('<script>'), 'script tag must be escaped');
  assert.match(html, /&lt;script&gt;/);

  hidePanel();
  assert.equal(dom.window.document.querySelector('#element-locator-host'), null);
  restoreClipboard?.();
});

test('showPanel renders cross-origin frame note with url', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  stubClipboard();

  hidePanel();
  showPanel(minimalResult({
    inFrame: true,
    sameOrigin: false,
    path: '(cross-origin iframe)',
    url: 'https://docs.example.com/x',
  }));

  const shadow = dom.window.document.querySelector('#element-locator-host')!.shadowRoot!;
  const html = shadow.innerHTML;
  assert.match(html, /跨域 iframe/);
  assert.match(html, /https:\/\/docs\.example\.com\/x/);
  assert.match(html, /请先切换到对应 frame/);

  hidePanel();
  restoreClipboard?.();
});

test('java-escape option escapes double quotes in shown and copied selectors', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  (globalThis as unknown as { window: unknown }).window = dom.window;
  (globalThis as unknown as { document: Document }).document = dom.window.document;

  const result = minimalResult();
  result.xpath.best = { ...result.xpath.best!, selector: "//*[@title='a\"b']" };
  result.css.best = { ...result.css.best!, selector: "[data-testid='x']" };

  let copied = '';
  Object.defineProperty(globalThis.navigator as { clipboard?: unknown }, 'clipboard', {
    value: { writeText: async (t: string) => { copied = t; } },
    configurable: true,
  });
  document.execCommand = () => true;

  hidePanel();
  showPanel(result);

  const shadow = dom.window.document.querySelector('#element-locator-host')!.shadowRoot!;
  const opt = shadow.querySelector<HTMLInputElement>('input[data-act="java-escape"]');
  assert.ok(opt, 'java-escape checkbox should exist');

  // 默认未勾选：XPath 展示原文（含一个原始双引号）
  const xpathCode = shadow.querySelector<HTMLElement>('code[data-sel="xpath"]')!;
  assert.ok(xpathCode.textContent!.includes('a"b'));

  // 勾选后：展示与复制都把 " 转义为 \"
  opt!.checked = true;
  opt!.dispatchEvent(new dom.window.Event('change'));
  const shown = xpathCode.textContent!;
  assert.ok(!shown.includes('a"b'), 'raw double quote should be escaped');
  assert.ok(shown.includes('a\\"b'), 'escaped form a\\"b should be shown');

  shadow.querySelector<HTMLButtonElement>('[data-act="copy"][data-kind="xpath"]')!.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(copied, "//*[@title='a\\\"b']");

  hidePanel();
});

test('ancestor picker renders breadcrumb and onPick fires on click', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><article id="wrap"><button>go</button></article></body></html>');
  (globalThis as unknown as { window: unknown }).window = dom.window;
  (globalThis as unknown as { document: Document }).document = dom.window.document;
  stubClipboard();

  const picked: number[] = [];
  const changes: { s: boolean; d: number }[] = [];
  hidePanel();
  showPanel(minimalResult(), {
    ancestors: [
      { tag: 'button', id: null, classes: [], selected: true },
      { tag: 'article', id: 'wrap', classes: ['card'], selected: false },
      { tag: 'body', id: null, classes: [], selected: false },
    ],
    structural: false,
    structuralDepth: 0,
    onPick: (i) => picked.push(i),
    onStructuralChange: (s, d) => changes.push({ s, d }),
  });

  const shadow = dom.window.document.querySelector('#element-locator-host')!.shadowRoot!;
  const crumbs = shadow.querySelectorAll<HTMLElement>('[data-crumb]');
  assert.equal(crumbs.length, 3);

  // 当前选中的是 index 0（button）
  assert.ok(crumbs[0].classList.contains('on'));

  // 点击"article#wrap.card"那层（index 1）
  const wrap = shadow.querySelector<HTMLElement>('[data-crumb="1"]')!;
  assert.ok(wrap.textContent!.includes('article#wrap.card'));
  wrap.click();
  assert.deepEqual(picked, [1]);

  // 勾选"结构化"且填 N=2 → onStructuralChange(true, 2)
  const structOpt = shadow.querySelector<HTMLInputElement>('input[data-act="structural"]');
  assert.ok(structOpt, 'structural toggle should exist');
  structOpt!.checked = true;
  structOpt!.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(changes.at(-1), { s: true, d: 0 });

  const depthInput = shadow.querySelector<HTMLInputElement>('input[data-act="structural-depth"]');
  assert.ok(depthInput, 'depth input should exist');
  depthInput!.value = '2';
  depthInput!.dispatchEvent(new dom.window.Event('change'));
  assert.deepEqual(changes.at(-1), { s: true, d: 2 });

  hidePanel();
  restoreClipboard?.();
});
