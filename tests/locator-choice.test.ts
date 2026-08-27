import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildCssChoice, buildXPathChoice, isVerifiedCandidate } from '../src/content/locator-choice';
import type { Evaluator } from '../src/content/types';

function makeDom(html: string): JSDOM {
  return new JSDOM(`<body>${html}</body>`);
}

// 可控求值器：XPath 按 selector 字符串映射（multiXpaths 中的返回 multiple）；
// CSS 用 jsdom 真实 querySelectorAll 求值。
function makeEvaluator(dom: JSDOM, target: Element, multiXpaths: string[] = []): Evaluator {
  return {
    evaluateXPath(xpath, t) {
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

test('stable id wins and isVerifiedCandidate gates on unique + matchesTarget', () => {
  const dom = makeDom('<form id="toolbar"><button id="save">保存</button></form>');
  const button = dom.window.document.querySelector('button')!;
  const evaluator = makeEvaluator(dom, button);

  const css = buildCssChoice(button, evaluator);
  const xpath = buildXPathChoice(button, evaluator);

  assert.equal(css.best?.selector, '#save');
  assert.equal(xpath.best?.selector, "//button[@id='save']");
  assert.equal(isVerifiedCandidate(css.best!), true);
  assert.equal(isVerifiedCandidate({
    ...css.best!,
    validation: { status: 'multiple', count: 2, matchesTarget: false },
  }), false);
});

test('CSS: a multiple-match class is strengthened with an ancestor constraint', () => {
  const dom = makeDom('<div id="wrap"><button class="pick-me">A</button></div><span class="pick-me">B</span>');
  const button = dom.window.document.querySelector('button')!;
  const css = buildCssChoice(button, makeEvaluator(dom, button));

  // .pick-me 全页命中 2 个 => 加父级作用域后成为唯一 best。
  assert.equal(css.best?.selector, '#wrap .pick-me');
  assert.equal(css.best?.parentContext, true);
  const plain = css.all.find((c) => c.selector === '.pick-me');
  assert.equal(plain?.validation?.status, 'multiple');
});

test('XPath: a multiple-match text candidate is strengthened with ancestor context', () => {
  const dom = makeDom('<div id="wrap"><button>A</button><button>A</button></div>');
  const button = dom.window.document.querySelectorAll('button')[1];
  const plain = "//button[normalize-space()='A']";
  const xpath = buildXPathChoice(button, makeEvaluator(dom, button, [plain]));

  assert.equal(xpath.best?.selector, "//div[@id='wrap']//button[normalize-space()='A']");
  assert.equal(xpath.best?.parentContext, true);
  const plainCand = xpath.all.find((c) => c.selector === plain);
  assert.equal(plainCand?.validation?.status, 'multiple');
});

test('structuralOnly excludes text candidates but keeps the absolute XPath', () => {
  const dom = makeDom('<ul id="list"><li><span>33</span></li><li><span>24</span></li></ul>');
  const span = dom.window.document.querySelectorAll('span')[0];
  const evaluator = makeEvaluator(dom, span);
  const opts = { structuralOnly: true };

  // 正反对照：不加 structuralOnly 时，XPath 完整候选集合中确实存在文字候选，
  // 以证明下面的过滤断言有回归拦截力。
  const plainXpath = buildXPathChoice(span, evaluator);
  assert.ok(plainXpath.all.some((c) => c.kind === 'text'));

  const xpath = buildXPathChoice(span, evaluator, opts);
  const css = buildCssChoice(span, evaluator, opts);

  assert.ok(!xpath.all.some((c) => c.kind === 'text'));
  // 文档性契约：css-generator 本就不产出 kind==='text' 的候选，
  // 此断言用于固化该契约，并非 structuralOnly 过滤器行为测试。
  assert.ok(!css.all.some((c) => c.kind === 'text'));
  // 普通元素的完整候选集合仍包含绝对 XPath（structuralOnly 只过滤文字候选）。
  assert.ok(xpath.all.some((c) => c.kind === 'absolute'));
});

test('candidates stay sorted by the existing scoreCandidate ordering', () => {
  const dom = makeDom('<form id="toolbar"><button id="save">保存</button><button>取消</button></form>');
  const button = dom.window.document.querySelector('button')!;
  const choice = buildCssChoice(button, makeEvaluator(dom, button));

  assert.ok(choice.all.length > 1);
  for (let i = 1; i < choice.all.length; i++) {
    assert.ok(choice.all[i - 1].score >= choice.all[i].score);
  }
  // best 是得分最高的已验证候选。
  const verifiedScores = choice.all.filter(isVerifiedCandidate).map((c) => c.score);
  assert.ok(verifiedScores.length > 0);
  assert.equal(choice.best?.score, Math.max(...verifiedScores));
});
