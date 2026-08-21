import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  buildXPathCandidates,
  xpathStringLiteral,
  buildAncestorConstraint,
  withAncestorConstraint,
  buildPositionalCandidates,
  buildAbsoluteXPath,
  findAncestorAnchor,
  buildStructuralXPathCandidates,
  buildStructuralXPathDepth,
} from '../src/content/xpath-generator';

function el(html: string, sel: string): Element {
  return new JSDOM(`<body>${html}</body>`).window.document.querySelector(sel)!;
}

test('prefers stable id', () => {
  const target = el('<button id="query">查询</button>', 'button');
  const cands = buildXPathCandidates(target);
  assert.equal(cands[0].selector, "//*[@id='query']");
  assert.equal(cands[1].selector, "//button[@id='query']");
});

test('uses data-testid', () => {
  const target = el('<button data-testid="submit">查询</button>', 'button');
  assert.equal(buildXPathCandidates(target)[0].selector, "//*[@data-testid='submit']");
});

test('preserves the actual test-id attribute name', () => {
  const target = el('<button data-qa="submit">查询</button>', 'button');
  assert.equal(buildXPathCandidates(target)[0].selector, "//*[@data-qa='submit']");
});

test('uses name', () => {
  const target = el('<button name="query">查询</button>', 'button');
  assert.ok(buildXPathCandidates(target).some((c) => c.selector === "//button[@name='query']"));
});

test('uses normalized text', () => {
  const target = el('<button> 查\n询 </button>', 'button');
  const textCand = buildXPathCandidates(target).find((c) => c.kind === 'text');
  assert.equal(textCand?.selector, "//button[normalize-space()='查 询']");
});

test('uses stable class', () => {
  const target = el('<button class="primary">查询</button>', 'button');
  const clsCand = buildXPathCandidates(target).find((c) => c.kind === 'class');
  assert.equal(
    clsCand?.selector,
    "//*[contains(concat(' ', normalize-space(@class), ' '), ' primary ')]",
  );
});

test('xpathStringLiteral escapes quotes', () => {
  assert.equal(xpathStringLiteral('abc'), "'abc'");
  assert.equal(xpathStringLiteral('a"b'), "'a\"b'");
  assert.equal(xpathStringLiteral("it's"), '"it\'s"');
  assert.ok(xpathStringLiteral('say "hi" it\'s').startsWith('concat('));
  assert.equal(xpathStringLiteral('say "hi" it\'s'), 'concat(\'say "hi" it\', "\'", \'s\')');
});

test('buildAncestorConstraint finds stable ancestor', () => {
  const dom = new JSDOM('<body><div id="search-area"><button>查询</button></div></body>');
  const btn = dom.window.document.querySelector('button')!;
  assert.equal(buildAncestorConstraint(btn), "//div[@id='search-area']");
});

test('buildAncestorConstraint preserves a test-id alias', () => {
  const dom = new JSDOM('<body><div data-cy="scope"><span>x</span></div></body>');
  const target = dom.window.document.querySelector('span')!;
  assert.equal(buildAncestorConstraint(target), "//*[@data-cy='scope']");
});

test('findAncestorAnchor returns the element', () => {
  const dom = new JSDOM('<body><div id="search-area"><button>查询</button></div></body>');
  const btn = dom.window.document.querySelector('button')!;
  const anchor = findAncestorAnchor(btn)!;
  assert.equal(anchor.getAttribute('id'), 'search-area');
});

test('withAncestorConstraint combines', () => {
  assert.equal(
    withAncestorConstraint("//div[@id='search-area']", "//button[normalize-space()='查询']"),
    "//div[@id='search-area']//button[normalize-space()='查询']",
  );
});

test('buildPositionalCandidates and absolute path', () => {
  const dom = new JSDOM('<body><div><button>a</button><button>b</button></div></body>');
  const target = dom.window.document.querySelectorAll('button')[1];
  const pos = buildPositionalCandidates(target);
  assert.ok(pos.some((c) => c.selector === '(//button)[2]'));
  assert.equal(buildAbsoluteXPath(target).selector, '/html/body[2]/div[1]/button[2]');
});

test('uses href for links', () => {
  const target = el('<a href="https://www.creditchina.gov.cn/abc?token=1">信用中国</a>', 'a');
  const hrefCand = buildXPathCandidates(target).find((c) => c.kind === 'href');
  assert.equal(
    hrefCand?.selector,
    "//a[@href='https://www.creditchina.gov.cn/abc' or starts-with(@href, 'https://www.creditchina.gov.cn/abc?') or starts-with(@href, 'https://www.creditchina.gov.cn/abc#')]",
  );
});

test('buildStructuralXPathCandidates climbs to stable ancestors', () => {
  const dom = new JSDOM('<body><ul id="list"><li><p class="tem"><span>33</span></p></li></ul></body>');
  const span = dom.window.document.querySelector('span')!;
  const cands = buildStructuralXPathCandidates(span);
  assert.ok(cands.some((c) => c.selector === "//*[contains(concat(' ', normalize-space(@class), ' '), ' tem ')]/span[1]"));
  assert.ok(cands.some((c) => c.selector === "//*[@id='list']/li[1]/p[1]/span[1]"));
});

test('buildStructuralXPathDepth anchors at the Nth ancestor', () => {
  const dom = new JSDOM('<body><ul id="list"><li><p class="tem"><span>33</span></p></li></ul></body>');
  const span = dom.window.document.querySelector('span')!;
  // N=1：锚在最近的稳定祖先 p.tem
  assert.equal(
    buildStructuralXPathDepth(span, 1)?.selector,
    "//*[contains(concat(' ', normalize-space(@class), ' '), ' tem ')]/span[1]",
  );
  // N=2：锚在 li（无标识），顺带引用上方 ul#list 来消歧
  assert.equal(buildStructuralXPathDepth(span, 2)?.selector, "//*[@id='list']/li[1]/p[1]/span[1]");
});
