import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildFramePathSegment, describeFrameElement, getFrameInfo } from '../src/content/frame';
import { buildXPathChoice } from '../src/content/locator-choice';
import { createDomEvaluator } from '../src/content/validator';
import type {
  Evaluator,
  FrameLimitation,
  FramePathSegment,
  FrameSelectorCandidate,
  FrameSelectorKind,
} from '../src/content/types';

// 模拟求值器：XPath 按 selector 字符串映射（multiXpaths 返回 multiple、noneXpaths 返回 none，
// 其余默认 unique 且 matchesTarget 判定 t === target）；CSS 用 jsdom 真实 querySelectorAll。
function mockEvaluator(
  dom: JSDOM,
  target: Element,
  multiXpaths: string[] = [],
  noneXpaths: string[] = [],
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

// 仅 CSS 可验证的求值器：CSS 走真实 querySelectorAll，XPath 一律按不可验证处理
// （模拟 validator.ts 注释所述的"jsdom 无 XPath 支持"环境，隔离出纯 CSS 候选场景）。
function cssOnlyEvaluator(dom: JSDOM): Evaluator {
  const real = createDomEvaluator(dom.window.document);
  return {
    evaluateXPath: () => ({ status: 'error', count: 0, matchesTarget: false }),
    evaluateCss: (selector, t) => real.evaluateCss(selector, t),
  };
}

// 手写 Window 链 mock：提供 getFrameInfo 循环依赖的全部成员
// （self / top / parent / frameElement / location.href）。
// isTop 为 true 时构造链顶窗口（top 指向自身，getFrameInfo 视为顶层）；
// 内层窗口的 top 指向链顶对象、frameElement 指向真实 JSDOM 的 iframe 元素。
function fakeWindow(opts: {
  href: string;
  isTop?: boolean;
  top?: unknown;
  parent?: unknown;
  frameElement?: Element | null;
}): Window {
  const win: {
    location: { href: string };
    self: unknown;
    top: unknown;
    parent: unknown;
    frameElement: Element | null;
  } = {
    location: { href: opts.href },
    self: null,
    top: opts.isTop ? null : opts.top,
    parent: opts.parent ?? null,
    frameElement: opts.frameElement ?? null,
  };
  win.self = win;
  if (opts.isTop) win.top = win;
  return win as unknown as Window;
}

// 编译期 + 运行时兼顾的类型形状 Fixture：结构化 iframe 路径段。
test('FramePathSegment type shape fixture', () => {
  const segment: FramePathSegment = {
    preferred: {
      kind: 'css',
      selector: 'iframe#main',
      score: 100,
      validation: { status: 'unique', count: 1, matchesTarget: true },
    },
    candidates: [{
      kind: 'css',
      selector: 'iframe#main',
      score: 100,
      validation: { status: 'unique', count: 1, matchesTarget: true },
    }],
  };
  assert.equal(segment.preferred.kind, 'css');

  // xpath 成员同样是合法的 FrameSelectorCandidate.kind。
  const xpathCandidate: FrameSelectorCandidate = {
    kind: 'xpath',
    selector: '//iframe[@id="main"]',
    score: 90,
    validation: { status: 'unique', count: 1, matchesTarget: true },
  };
  assert.equal(xpathCandidate.kind, 'xpath');

  // 锁死 FrameLimitation 联合成员：'unlocatable' 可赋值。
  const lim: FrameLimitation = 'unlocatable';
  assert.equal(lim, 'unlocatable');

  // 负向编译期断言：'absolute' 不属于 FrameSelectorKind。typecheck 时此行必须报错，
  // 否则 @ts-expect-error 会因"未被使用"而失败，从而防止联合被静默放宽回 SelectorKind。
  // @ts-expect-error 'absolute' 不属于 FrameSelectorKind
  const badKind: FrameSelectorKind = 'absolute';
  assert.equal(badKind, 'absolute');
});

test('getFrameInfo: top-level window is not a frame', () => {
  const dom = new JSDOM('<body></body>');
  const info = getFrameInfo(dom.window as unknown as Window);
  assert.equal(info.inFrame, false);
  // 顶层页面：空结构化路径，且不设置受限原因。
  assert.deepEqual(info.locatorPath, []);
  assert.equal(info.limitation, undefined);
});

test('describeFrameElement uses name first', () => {
  const dom = new JSDOM('<body><iframe name="main"></iframe></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  assert.equal(describeFrameElement(iframe), "iframe[name='main']");
});

test('describeFrameElement falls back to index', () => {
  const dom = new JSDOM('<body><iframe></iframe><iframe></iframe></body>');
  const iframes = dom.window.document.querySelectorAll('iframe');
  assert.equal(describeFrameElement(iframes[1]), 'iframe[2]');
});

test('getFrameInfo: cross-origin walk that throws yields cross-origin fallback', () => {
  // 用两个不同的对象代表 self 与 top，使 while 走到 frameElement 访问并抛错（跨域）。
  const selfMarker = {};
  const topMarker = {};
  const win = {
    location: { href: 'https://docs.example.com/page' },
    get self(): unknown {
      return selfMarker;
    },
    get top(): unknown {
      return topMarker;
    },
    get frameElement(): unknown {
      throw new Error('blocked: cross-origin');
    },
  } as unknown as Window;
  const info = getFrameInfo(win);
  assert.deepEqual(info, {
    inFrame: true,
    path: '(cross-origin iframe)',
    url: 'https://docs.example.com/page',
    sameOrigin: false,
    locatorPath: [],
    limitation: 'cross-origin',
  });
});

test('getFrameInfo: same-origin nested iframes assemble a root-to-leaf locatorPath', () => {
  // 用真实 JSDOM 文档承载 iframe 元素（候选验证需要可用的 ownerDocument），
  // window 链用 fakeWindow 手写：inner → outer → top。
  const dom = new JSDOM(
    '<body><iframe id="outer-frame"></iframe><iframe id="inner-frame"></iframe></body>',
  );
  const [outerIframe, innerIframe] = dom.window.document.querySelectorAll('iframe');
  const topWin = fakeWindow({ href: 'https://app.example.com/index', isTop: true });
  const outerWin = fakeWindow({
    href: 'https://app.example.com/outer',
    top: topWin,
    parent: topWin,
    frameElement: outerIframe,
  });
  const innerWin = fakeWindow({
    href: 'https://app.example.com/inner',
    top: topWin,
    parent: outerWin,
    frameElement: innerIframe,
  });

  const info = getFrameInfo(innerWin);
  assert.equal(info.inFrame, true);
  assert.equal(info.sameOrigin, true);
  assert.equal(info.limitation, undefined);
  // url 仍为当前 Frame 的 URL。
  assert.equal(info.url, 'https://app.example.com/inner');
  // 展示路径保持原有格式，顺序外→内。
  assert.equal(info.path, "iframe[id='outer-frame'] > iframe[id='inner-frame']");
  assert.equal(info.locatorPath.length, 2);

  // 分数优先裁决（score-first，同分才 css 优先）：jsdom 25 支持真实 XPath 求值，
  // 带 tagExact 加成的 id XPath 候选（105 分）高于纯 CSS id 候选（100 分），
  // 因此 preferred 是 xpath 而非 '#outer-frame'/'#inner-frame'。
  assert.deepEqual(
    info.locatorPath.map(({ preferred }) => preferred.selector),
    ["//iframe[@id='outer-frame']", "//iframe[@id='inner-frame']"],
  );

  // 每个 segment 满足 FramePathSegment 形状：candidates 非空、
  // preferred 即排序后的首个、全部候选唯一命中目标、不含绝对 XPath。
  for (const segment of info.locatorPath) {
    assert.ok(segment.candidates.length > 0);
    assert.equal(segment.preferred, segment.candidates[0]);
    assert.equal(segment.candidates.every(({ validation }) => (
      validation.status === 'unique' && validation.matchesTarget
    )), true);
    assert.equal(segment.candidates.some(({ selector }) => selector.startsWith('/html/')), false);
  }
});

test('getFrameInfo: an unlocatable middle level discards partial paths and reports unlocatable', () => {
  // 三级同源嵌套，中间级 ownerDocument 被换成敌意文档：
  // XPath 无法求值（evaluate 非 function）、CSS 恒返回 2 个节点（multiple），
  // 该级任何候选都无法唯一命中 => 整条路径必须清空并报告 unlocatable。
  const dom = new JSDOM(
    '<body>' +
    '<iframe id="outer-frame"></iframe>' +
    '<iframe id="mid-frame"></iframe>' +
    '<iframe id="inner-frame"></iframe>' +
    '</body>',
  );
  const iframes = dom.window.document.querySelectorAll('iframe');

  const hostileDoc = {
    evaluate: undefined,
    querySelectorAll: () => [{} as Element, {} as Element],
    defaultView: null,
  } as unknown as Document;
  // defineProperty 会永久改写该元素属性，此元素只在本用例中使用。
  Object.defineProperty(iframes[1], 'ownerDocument', { value: hostileDoc });

  const topWin = fakeWindow({ href: 'https://app.example.com/index', isTop: true });
  const outerWin = fakeWindow({
    href: 'https://app.example.com/outer',
    top: topWin,
    parent: topWin,
    frameElement: iframes[0],
  });
  const midWin = fakeWindow({
    href: 'https://app.example.com/mid',
    top: topWin,
    parent: outerWin,
    frameElement: iframes[1],
  });
  const innerWin = fakeWindow({
    href: 'https://app.example.com/inner',
    top: topWin,
    parent: midWin,
    frameElement: iframes[2],
  });

  const info = getFrameInfo(innerWin);
  assert.equal(info.limitation, 'unlocatable');
  assert.equal(info.sameOrigin, true);
  // 内层已成功生成的半条结构化路径绝不能泄露出来。
  assert.deepEqual(info.locatorPath, []);
  // 失败分支的人类可读 path 契约：保留已走到的各级（含失败级本身），
  // 任务 5 的面板将直接消费它。（遍历从最内层出发，失败发生在中层级，
  // 故实际输出为 mid > inner，以外层顺序呈现已收集部分。）
  assert.equal(info.path, "iframe[id='mid-frame'] > iframe[id='inner-frame']");
});

test('getFrameInfo: a mid-walk detached frame element discards partial paths and reports unlocatable', () => {
  // 遍历已收集内层一级后，中间级窗口非 top 但 frameElement 取到 null
  // （祖先 iframe 在遍历中途脱离 DOM；返回 null 而非抛错）。
  // 此时结构化路径缺少上层各级，必须清空并报告 unlocatable，绝不能当成功路径返回。
  const dom = new JSDOM('<body><iframe id="inner-frame"></iframe></body>');
  const innerIframe = dom.window.document.querySelector('iframe')!;
  const topWin = fakeWindow({ href: 'https://app.example.com/index', isTop: true });
  // midWin 不提供 frameElement：fakeWindow 默认即 null（detached），不抛错。
  const midWin = fakeWindow({
    href: 'https://app.example.com/mid',
    top: topWin,
    parent: topWin,
  });
  const innerWin = fakeWindow({
    href: 'https://app.example.com/inner',
    top: topWin,
    parent: midWin,
    frameElement: innerIframe,
  });

  const info = getFrameInfo(innerWin);
  assert.equal(info.limitation, 'unlocatable');
  assert.equal(info.sameOrigin, true);
  assert.deepEqual(info.locatorPath, []);
  // path 同样只保留已走到的展示部分。
  assert.equal(info.path, "iframe[id='inner-frame']");
});

test('getFrameInfo: candidate generation crash maps to unlocatable, not cross-origin', () => {
  // 候选生成阶段（含默认求值器构建，需读取 ownerDocument）意外抛错时，
  // iframe 本身可访问，应按 unlocatable 处理，而不是误报成跨域受限。
  const dom = new JSDOM('<body><iframe id="solo"></iframe></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  Object.defineProperty(iframe, 'ownerDocument', {
    get() {
      throw new Error('simulated generator crash');
    },
  });

  const topWin = fakeWindow({ href: 'https://app.example.com/index', isTop: true });
  const innerWin = fakeWindow({
    href: 'https://app.example.com/inner',
    top: topWin,
    parent: topWin,
    frameElement: iframe,
  });

  const info = getFrameInfo(innerWin);
  assert.equal(info.limitation, 'unlocatable');
  assert.equal(info.sameOrigin, true);
  assert.deepEqual(info.locatorPath, []);
});

// 用仅 CSS 可验证的求值器隔离出纯 CSS 场景：首选稳定 id 的 #main-frame。
// （当前 jsdom 已支持 XPath 求值；若走完整求值器，tag 精确的 xpath id 候选会以
// 105 分压过 css 的 100 分成为 preferred，故这里显式屏蔽 XPath。）
test('buildFramePathSegment: stable id iframe prefers the css id candidate', () => {
  const dom = new JSDOM('<body><iframe id="main-frame"></iframe></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  const evaluator = cssOnlyEvaluator(dom);

  const segment = buildFramePathSegment(iframe, evaluator);
  assert.ok(segment, 'should produce a segment for a stable-id iframe');
  assert.equal(segment.preferred.kind, 'css');
  assert.equal(segment.preferred.selector, '#main-frame');
  // 运行时不变式：preferred 即排序后的 candidates[0]。
  assert.equal(segment.preferred, segment.candidates[0]);
  assert.equal(segment.candidates.every(({ validation }) => (
    validation.status === 'unique' && validation.matchesTarget
  )), true);
  assert.equal(segment.candidates.some(({ selector }) => selector.startsWith('/html/')), false);
});

test('buildFramePathSegment: unique name produces [name=...] style candidates', () => {
  const dom = new JSDOM('<body><iframe name="main"></iframe></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  const evaluator = mockEvaluator(dom, iframe);

  const segment = buildFramePathSegment(iframe, evaluator);
  assert.ok(segment);
  // CSS 侧与 XPath 侧都应产出基于 name 的候选。
  assert.ok(segment.candidates.some((c) => c.kind === 'css' && c.selector === "[name='main']"));
  assert.ok(segment.candidates.some((c) => c.kind === 'xpath' && c.selector === "//iframe[@name='main']"));
  assert.equal(segment.candidates.every(({ validation }) => (
    validation.status === 'unique' && validation.matchesTarget
  )), true);
  assert.equal(segment.candidates.some(({ selector }) => selector.startsWith('/html/')), false);
});

test('buildFramePathSegment: duplicated id stays out while structural unique candidate gets in', () => {
  const dom = new JSDOM(
    '<body><section id="p1"><iframe id="dup"></iframe></section><div><iframe id="dup"></iframe></div></body>',
  );
  const target = dom.window.document.querySelectorAll('#dup')[0];

  // 不传 evaluator：覆盖默认参数路径（createDomEvaluator(frameElement.ownerDocument)）。
  const segment = buildFramePathSegment(target);
  assert.ok(segment, 'structural unique candidates should survive duplicate ids');

  // 朴素 #dup 全页命中 2 个 => 不得进入 candidates；父级约束加固后的候选可以进入。
  assert.equal(segment.candidates.some(({ selector }) => selector === '#dup'), false);
  assert.ok(segment.candidates.some((c) => c.selector === '#p1 #dup'));
  assert.equal(segment.candidates.every(({ validation }) => (
    validation.status === 'unique' && validation.matchesTarget
  )), true);
  // CSS 结构化管线会从两个来源产出同一选择器，去重后只保留一个。
  assert.equal(
    segment.candidates.filter((c) => c.selector === '#p1 > iframe:nth-child(1)').length,
    1,
  );

  // 仅 CSS 可验证的求值器下，父级约束加固后的 CSS 候选（130 分）应为首选。
  const cssSegment = buildFramePathSegment(target, cssOnlyEvaluator(dom));
  assert.ok(cssSegment);
  assert.equal(cssSegment.preferred.kind, 'css');
  assert.equal(cssSegment.preferred.selector, '#p1 #dup');
});

test('buildFramePathSegment: absolute xpath is excluded while other xpath candidates get in', () => {
  const dom = new JSDOM('<body><iframe id="solo"></iframe></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  const evaluator = mockEvaluator(dom, iframe);

  // 正反对照：管线确实产出了会被验证通过的绝对 XPath 候选，
  // 以证明下面的排除断言有回归拦截力。
  const raw = buildXPathChoice(iframe, evaluator, { structuralOnly: true });
  assert.ok(raw.all.some((c) => c.kind === 'absolute' && c.selector.startsWith('/html/')));

  const segment = buildFramePathSegment(iframe, evaluator);
  assert.ok(segment);
  // XPath 候选确实进入了路径段（mock 求值器默认 unique）。
  assert.ok(segment.candidates.some((c) => c.kind === 'xpath'));
  assert.equal(segment.candidates.some(({ selector }) => selector.startsWith('/html/')), false);
  assert.equal(segment.candidates.every(({ validation }) => (
    validation.status === 'unique' && validation.matchesTarget
  )), true);
});

test('buildFramePathSegment: returns undefined when no candidate verifies uniquely', () => {
  const dom = new JSDOM('<body><iframe id="x"></iframe></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  // 敌意求值器：一律 multiple 且不命中目标，任何候选都无法通过验证。
  const hostile: Evaluator = {
    evaluateXPath: () => ({ status: 'multiple', count: 2, matchesTarget: false }),
    evaluateCss: () => ({ status: 'multiple', count: 2, matchesTarget: false }),
  };
  assert.equal(buildFramePathSegment(iframe, hostile), undefined);
});

test('buildFramePathSegment: a unique candidate pointing at another element is excluded', () => {
  const dom = new JSDOM('<body><iframe id="decoy"></iframe><iframe id="real"></iframe></body>');
  const target = dom.window.document.querySelector('#real')!;
  const base = mockEvaluator(dom, target);
  const evaluator: Evaluator = {
    evaluateXPath: (xpath, t) => base.evaluateXPath(xpath, t),
    evaluateCss(selector, t) {
      // #decoy 验证为 unique 但命中的是另一个 iframe：必须被剔除。
      if (selector === '#decoy') return { status: 'unique', count: 1, matchesTarget: false };
      return base.evaluateCss(selector, t);
    },
  };

  const segment = buildFramePathSegment(target, evaluator);
  assert.ok(segment);
  assert.equal(segment.candidates.some(({ selector }) => selector === '#decoy'), false);
  assert.equal(segment.candidates.every(({ validation }) => (
    validation.status === 'unique' && validation.matchesTarget
  )), true);
});

test('buildFramePathSegment: repeated runs yield identical preferred and candidate order', () => {
  const dom = new JSDOM('<body><div id="wrap"><iframe name="main" id="m1"></iframe></div></body>');
  const iframe = dom.window.document.querySelector('iframe')!;
  const first = buildFramePathSegment(iframe, mockEvaluator(dom, iframe));
  const second = buildFramePathSegment(iframe, mockEvaluator(dom, iframe));
  assert.ok(first && second);
  assert.deepEqual(second.preferred, first.preferred);
  assert.deepEqual(second.candidates, first.candidates);
});

test('getFrameInfo: cross-origin boundary with frameElement null returns cross-origin', () => {
  // 模拟跨域边界场景：
  // innerWindow: frameElement = 可正常定位的 inner iframe, parent = boundaryWindow
  // boundaryWindow: frameElement = null, parent.document 访问时抛异常
  const dom = new JSDOM('<body><iframe id="inner-frame"></iframe></body>');
  const innerIframe = dom.window.document.querySelector('iframe')!;
  const topWin = fakeWindow({ href: 'https://app.example.com/index', isTop: true });

  // boundaryWindow: frameElement = null, parent.document 访问时抛异常
  const boundaryWin = {
    location: { href: 'https://boundary.example.com/frame' },
    self: null as unknown as Window,
    top: topWin,
    parent: {
      get document() {
        throw new Error('SecurityError: Blocked a frame with origin "https://boundary.example.com" from accessing a cross-origin frame');
      },
    },
    frameElement: null,
  };
  (boundaryWin as unknown as { self: Window }).self = boundaryWin as unknown as Window;

  const innerWin = fakeWindow({
    href: 'https://app.example.com/inner',
    top: topWin,
    parent: boundaryWin,
    frameElement: innerIframe,
  });

  const info = getFrameInfo(innerWin);
  assert.equal(info.inFrame, true);
  assert.equal(info.sameOrigin, false);
  assert.equal(info.limitation, 'cross-origin');
  assert.deepEqual(info.locatorPath, []);
  assert.equal(info.path, '(cross-origin iframe)');
});

test('getFrameInfo: same-origin detached frame element remains unlocatable, not cross-origin', () => {
  // 确保原来的 detached iframe 测试继续通过：
  // 同源 detached 仍然是 unlocatable，不能被误判成跨域。
  const dom = new JSDOM('<body><iframe id="inner-frame"></iframe></body>');
  const innerIframe = dom.window.document.querySelector('iframe')!;
  const topWin = fakeWindow({ href: 'https://app.example.com/index', isTop: true });

  // boundaryWin: frameElement = null, 但 parent.document 可以访问（同源）
  const boundaryWin = fakeWindow({
    href: 'https://app.example.com/boundary',
    top: topWin,
    parent: topWin,
    // frameElement 默认为 null（detached）
  });

  const innerWin = fakeWindow({
    href: 'https://app.example.com/inner',
    top: topWin,
    parent: boundaryWin,
    frameElement: innerIframe,
  });

  const info = getFrameInfo(innerWin);
  assert.equal(info.inFrame, true);
  assert.equal(info.sameOrigin, true);
  assert.equal(info.limitation, 'unlocatable');
  assert.deepEqual(info.locatorPath, []);
  // path 保留已走到的展示部分
  assert.equal(info.path, "iframe[id='inner-frame']");
});
