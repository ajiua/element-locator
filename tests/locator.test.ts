import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { generateLocator } from '../src/content/locator';
import type { Evaluator } from '../src/content/types';

function makeDom(html: string): JSDOM {
  return new JSDOM(`<body>${html}</body>`);
}

// 模拟求值器：XPath 按 selector 字符串映射；CSS 用 jsdom 真实 querySelectorAll。
function mockEvaluator(
  dom: JSDOM,
  target: Element,
  multiXpaths: string[],
  noneXpaths: string[],
): Evaluator {
  return {
    evaluateXPath(xpath, t) {
      if (noneXpaths.includes(xpath)) return { status: 'none', count: 0, matchesTarget: false };
      if (multiXpaths.includes(xpath)) return { status: 'multiple', count: 2, matchesTarget: false };
      return { status: 'unique', count: 1, matchesTarget: t === target };
    },
    evaluateCss(selector, t) {
      const nodes = dom.window.document.querySelectorAll(selector);
      const count = nodes.length;
      const status = count === 1 ? 'unique' : count > 1 ? 'multiple' : 'none';
      return { status, count, matchesTarget: count === 1 && nodes[0] === t };
    },
  };
}

test('best XPath is the tag-exact stable id when present', () => {
  const dom = makeDom('<div id="search-area"><button id="query">查询</button></div>');
  const btn = dom.window.document.querySelector('button')!;
  const result = generateLocator(btn, mockEvaluator(dom, btn, [], []), dom.window as unknown as Window);
  assert.equal(result.xpath.best?.selector, "//button[@id='query']");
  assert.equal(result.xpath.best?.score, 105);
});

test('ambiguous text is strengthened with ancestor context', () => {
  const dom = makeDom('<div id="search-area"><button>查询</button><button>查询</button></div>');
  const btn = dom.window.document.querySelectorAll('button')[1];
  const plain = "//button[normalize-space()='查询']";
  const result = generateLocator(btn, mockEvaluator(dom, btn, [plain], []), dom.window as unknown as Window);
  const best = result.xpath.best;
  assert.ok(best);
  assert.equal(best.selector, "//div[@id='search-area']//button[normalize-space()='查询']");
  assert.ok(best.parentContext);
  const plainCand = result.xpath.all.find((c) => c.selector === plain);
  assert.equal(plainCand?.validation?.status, 'multiple');
});

test('CSS: a unique class is not ancestor-scoped', () => {
  const dom = makeDom('<div id="search-area"><button class="locator-solo">查询</button></div>');
  const btn = dom.window.document.querySelector('button')!;
  const result = generateLocator(btn, mockEvaluator(dom, btn, [], []), dom.window as unknown as Window);
  // locator-solo 全页唯一 => 不加父级作用域，只命中该元素。
  assert.equal(result.css.best?.selector, '.locator-solo');
  assert.equal(result.css.best?.parentContext, false);
});

test('CSS: an ambiguous class is strengthened with parent context', () => {
  const dom = makeDom('<div id="search-area"><button class="primary">查询</button></div><button class="primary">x</button>');
  const btn = dom.window.document.querySelector('button')!;
  const result = generateLocator(btn, mockEvaluator(dom, btn, [], []), dom.window as unknown as Window);
  // .primary 全页不唯一 => 加父级作用域加固为唯一
  assert.equal(result.css.best?.selector, '#search-area .primary');
  assert.equal(result.css.best?.parentContext, true);
});

test('CSS: href boundary selector remains fully scoped by parent context', () => {
  const dom = makeDom(
    '<section id="left"><a href="/orders?tab=open">订单</a></section>' +
    '<section id="right"><a href="/orders?tab=closed">订单</a></section>',
  );
  const target = dom.window.document.querySelector('#left a')!;
  const result = generateLocator(target, mockEvaluator(dom, target, [], []), dom.window as unknown as Window);
  const scoped = result.css.all.find((c) => c.kind === 'href' && c.parentContext);
  assert.equal(
    scoped?.selector,
    "#left :is([href='/orders'],[href^='/orders?'],[href^='/orders#'])",
  );
  assert.equal(scoped?.validation?.status, 'unique');
  assert.equal(scoped?.validation?.matchesTarget, true);
});

test('parent-context positional candidate is selectable as best', () => {
  // 目标无 id/class/文本：常规候选为空，父级定位才是最高分且唯一命中的候选。
  const dom = makeDom('<ul id="list"><li>a</li><li></li></ul>');
  const target = dom.window.document.querySelectorAll('li')[1];
  const result = generateLocator(target, mockEvaluator(dom, target, [], []), dom.window as unknown as Window);
  assert.equal(result.xpath.best?.selector, "//ul[@id='list']/li[2]");
  assert.equal(result.xpath.best?.kind, 'parent');
  const positional = result.xpath.all.find((c) => c.kind === 'parent');
  assert.equal(positional?.validation?.status, 'unique');
  assert.equal(positional?.validation?.matchesTarget, true);
});

test('falls back to text / structural when no attributes', () => {
  const dom = makeDom('<div><button>查询</button></div>');
  const btn = dom.window.document.querySelector('button')!;
  const result = generateLocator(btn, mockEvaluator(dom, btn, [], []), dom.window as unknown as Window);
  assert.equal(result.xpath.best?.selector, "//button[normalize-space()='查询']");
  // 文档偏差：body 是 html 的第 2 个子元素（<head> 在前），故为 nth-child(2)。
  assert.equal(result.css.best?.selector, 'html > body:nth-child(2) > div:nth-child(1) > button:nth-child(1)');
});

test('structuralOnly excludes text and picks a structural locator for a changing value', () => {
  // 温度 span 没有 id/class，只有会变的文字；结构化模式下应改走结构路径，且不包含文字值。
  const dom = makeDom('<ul id="list"><li><p class="tem"><span>33</span></p></li><li><p class="tem"><span>24</span></p></li></ul>');
  const span = dom.window.document.querySelectorAll('span')[0];
  const result = generateLocator(span, mockEvaluator(dom, span, [], []), dom.window as unknown as Window, {
    structuralOnly: true,
  });

  // XPath 与 CSS 的 all 里都不应再有 text 候选
  assert.ok(!result.xpath.all.some((c) => c.kind === 'text'));
  assert.ok(!result.css.all.some((c) => c.kind === 'text'));
  // best 不应依赖文字值（不包含它的文本内容）
  assert.ok(result.xpath.best, 'should have an xpath best');
  assert.ok(result.css.best, 'should have a css best');
  assert.ok(!result.xpath.best!.selector.includes('33'), 'xpath best must not embed the changing text');
  assert.ok(!result.css.best!.selector.includes('33'), 'css best must not embed the changing text');
});

test('structuralOnly ignores hover state classes and uses a stable ancestor path', () => {
  const dom = makeDom(
    '<div id="show" style="display:none"><ul>' +
    '<li class="unselct unselect" num="101120101"><b>济南</b>-山东</li>' +
    '<li class="unselect" num="10112010101A"><b>济南</b>百里黄河风景区东区-山东省景点</li>' +
    '</ul></div>',
  );
  const target = dom.window.document.querySelector('li')!;
  const result = generateLocator(
    target,
    mockEvaluator(dom, target, [], []),
    dom.window as unknown as Window,
    { structuralOnly: true },
  );

  assert.equal(result.xpath.all.some((c) => c.kind === 'class'), false);
  assert.equal(result.css.all.some((c) => c.kind === 'class'), false);
  assert.equal(result.xpath.best?.selector, "//div[@id='show']/ul[1]/li[1]");
  assert.equal(result.css.best?.selector, '#show > ul:nth-child(1) > li:nth-child(1)');
  assert.equal(result.xpath.all.some((c) => c.selector.includes('@num=')), false);
  assert.equal(result.css.all.some((c) => c.selector.includes('[num=')), false);
});

test('unique text also gets a stable ancestor-scoped XPath candidate', () => {
  const dom = makeDom(
    '<div id="show"><ul><li class="unselct unselect"><b>济南</b>-山东</li></ul></div>',
  );
  const target = dom.window.document.querySelector('li')!;
  const result = generateLocator(target, mockEvaluator(dom, target, [], []), dom.window as unknown as Window);
  const scoped = result.xpath.all.find(
    (c) => c.kind === 'text' && c.selector === "//div[@id='show']//li[normalize-space()='济南-山东']",
  );

  assert.ok(scoped);
  assert.equal(scoped.parentContext, true);
  assert.equal(scoped.validation?.status, 'unique');
  assert.equal(result.xpath.best?.selector, scoped.selector);
});

test('generateLocator exposes structured frame.locatorPath without signature changes', () => {
  // 无需修改 generateLocator() 签名：结构化 iframe 路径通过
  // result.frame.locatorPath 自动携带；顶层 DOM 场景下为空数组且无受限原因。
  const dom = makeDom('<button id="save">保存</button>');
  const btn = dom.window.document.querySelector('button')!;
  const result = generateLocator(btn, mockEvaluator(dom, btn, [], []), dom.window as unknown as Window);

  assert.equal(result.frame.inFrame, false);
  assert.deepEqual(result.frame.locatorPath, []);
  assert.equal(result.frame.limitation, undefined);
});
