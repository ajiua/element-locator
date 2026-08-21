import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  buildCssCandidates,
  escapeCssIdentifier,
  cssAncestorConstraint,
  buildCssStructural,
  buildStructuralCssCandidates,
  buildStructuralCssDepth,
} from '../src/content/css-generator';

function el(html: string, sel: string): Element {
  return new JSDOM(`<body>${html}</body>`).window.document.querySelector(sel)!;
}

test('id -> #id', () => {
  const target = el('<button id="query">查询</button>', 'button');
  assert.equal(buildCssCandidates(target)[0].selector, '#query');
});

test('data-testid -> attribute', () => {
  const target = el('<button data-testid="submit">查询</button>', 'button');
  assert.equal(buildCssCandidates(target)[0].selector, "[data-testid='submit']");
});

test('test-id alias preserves its actual attribute name', () => {
  const target = el('<button data-qa="submit">查询</button>', 'button');
  assert.equal(buildCssCandidates(target)[0].selector, "[data-qa='submit']");
});

test('generic data attribute -> attribute selector', () => {
  const target = el('<button data-action="query">查询</button>', 'button');
  const data = buildCssCandidates(target).find((c) => c.kind === 'data');
  assert.equal(data?.selector, "[data-action='query']");
});

test('stable class -> .class', () => {
  const target = el('<button class="el-button primary">查询</button>', 'button');
  assert.equal(buildCssCandidates(target).find((c) => c.kind === 'class')?.selector, '.el-button');
});

test('escapeCssIdentifier handles leading digit and special chars', () => {
  assert.equal(escapeCssIdentifier('foo'), 'foo');
  assert.equal(escapeCssIdentifier('123abc'), '\\31 23abc');
  assert.equal(escapeCssIdentifier('a.b'), 'a\\2e b');
});

test('cssAncestorConstraint', () => {
  const dom = new JSDOM('<body><div id="search-area"><button>查询</button></div></body>');
  const btn = dom.window.document.querySelector('button')!;
  assert.equal(cssAncestorConstraint(btn), '#search-area');
});

test('cssAncestorConstraint supports name and test-id aliases', () => {
  const nameDom = new JSDOM('<body><section name="scope"><span>x</span></section></body>');
  const nameTarget = nameDom.window.document.querySelector('span')!;
  assert.equal(cssAncestorConstraint(nameTarget), "[name='scope']");
  assert.equal(buildCssStructural(nameTarget)?.selector, "[name='scope'] > span:nth-child(1)");

  const aliasDom = new JSDOM('<body><section data-cy="scope"><span>x</span></section></body>');
  const aliasTarget = aliasDom.window.document.querySelector('span')!;
  assert.equal(cssAncestorConstraint(aliasTarget), "[data-cy='scope']");
});

test('buildCssStructural builds indexed path', () => {
  const dom = new JSDOM('<body><div id="search-area"><div><button>a</button><button>b</button></div></div></body>');
  const target = dom.window.document.querySelectorAll('button')[1];
  const s = buildCssStructural(target);
  assert.equal(s?.selector, '#search-area > div:nth-child(1) > button:nth-child(2)');
});

test('uses href for links (css)', () => {
  const dom = new JSDOM('<body><a id="target" href="https://www.creditchina.gov.cn/abc?t=1">信用中国</a><a href="https://www.creditchina.gov.cn/abc/archive">归档</a></body>');
  const target = dom.window.document.querySelector('#target')!;
  const hrefCand = buildCssCandidates(target).find((c) => c.kind === 'href');
  assert.equal(
    hrefCand?.selector,
    ":is([href='https://www.creditchina.gov.cn/abc'],[href^='https://www.creditchina.gov.cn/abc?'],[href^='https://www.creditchina.gov.cn/abc#'])",
  );
  assert.deepEqual([...dom.window.document.querySelectorAll(hrefCand!.selector)], [target]);
});

test('buildStructuralCssCandidates climbs to stable ancestors', () => {
  const dom = new JSDOM('<body><ul id="list"><li><p class="tem"><span>33</span></p></li></ul></body>');
  const span = dom.window.document.querySelector('span')!;
  const cands = buildStructuralCssCandidates(span);
  assert.ok(cands.some((c) => c.selector === '.tem > span:nth-child(1)'));
  assert.ok(cands.some((c) => c.selector === '#list > li:nth-child(1) > p:nth-child(1) > span:nth-child(1)'));
});

test('buildStructuralCssDepth anchors at the Nth ancestor', () => {
  const dom = new JSDOM('<body><ul id="list"><li><p class="tem"><span>33</span></p></li></ul></body>');
  const span = dom.window.document.querySelector('span')!;
  assert.equal(buildStructuralCssDepth(span, 1)?.selector, '.tem > span:nth-child(1)');
  assert.equal(buildStructuralCssDepth(span, 2)?.selector, '#list > li:nth-child(1) > p:nth-child(1) > span:nth-child(1)');
});
