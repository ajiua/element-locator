import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createDomEvaluator, generateLocator } from '../src/library/index';
import type {
  Evaluator,
  FrameInfo,
  FramePathSegment,
  ShadowSelectorKind,
} from '../src/library/index';

test('package 声明稳定的库入口边界', () => {
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as {
    name?: string;
    version?: string;
    type?: string;
    private?: boolean;
    main?: string;
    types?: string;
    exports?: unknown;
    files?: string[];
  };

  assert.equal(packageJson.name, 'element-locator');
  assert.equal(packageJson.version, '1.0.0');
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.main, undefined);
  assert.equal(packageJson.types, './dist/library/index.d.ts');
  assert.deepEqual(packageJson.exports, {
    '.': {
      types: './dist/library/index.d.ts',
      import: './dist/library/index.js',
    },
  });
  assert.deepEqual(packageJson.files, ['dist/library', 'LICENSE', 'README.md']);
});

test('公开入口可为唯一 id 按钮生成 CSS 与 XPath 候选', () => {
  const dom = new JSDOM('<body><button id="save">保存</button></body>');
  const button = dom.window.document.querySelector('button')!;
  const domEvaluator = createDomEvaluator(dom.window.document);
  const evaluator: Evaluator = {
    evaluateCss: domEvaluator.evaluateCss,
    evaluateXPath(xpath, target) {
      return xpath === "//button[@id='save']"
        ? { status: 'unique', count: 1, matchesTarget: target === button }
        : { status: 'none', count: 0, matchesTarget: false };
    },
  };
  const result = generateLocator(
    button,
    evaluator,
    dom.window as unknown as Window,
  );

  assert.equal(result.css.best?.selector, '#save');
  assert.equal(result.css.best?.validation?.matchesTarget, true);
  assert.equal(result.xpath.best?.selector, "//button[@id='save']");
  assert.equal(result.xpath.best?.validation?.matchesTarget, true);
});

test('公开入口暴露 Frame 类型且顶层元素的结构化路径为空', () => {
  const dom = new JSDOM('<body><button id="save">保存</button></body>');
  const button = dom.window.document.querySelector('button')!;
  const result = generateLocator(
    button,
    createDomEvaluator(dom.window.document),
    dom.window as unknown as Window,
  );

  const frame: FrameInfo = result.frame;
  const path: FramePathSegment[] = frame.locatorPath;
  assert.deepEqual(path, []);
});

test('公开入口为 open Shadow DOM 的 host 与内部路径提供已验证候选', () => {
  const dom = new JSDOM('<body><div id="host"></div></body>');
  const host = dom.window.document.querySelector('#host')!;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<button>保存</button>';
  const inner = root.querySelector('button')!;
  const result = generateLocator(inner, createDomEvaluator(dom.window.document), dom.window as unknown as Window);

  assert.deepEqual(result.shadow.hostCandidates.xpath?.validation, { status: 'unique', count: 1, matchesTarget: true });
  assert.equal(result.shadow.hostCandidates.xpath?.kind, 'document-relative-xpath');
  assert.deepEqual(result.shadow.hostCandidates.css?.validation, { status: 'unique', count: 1, matchesTarget: true });
  assert.equal(result.shadow.hostCandidates.css?.kind, 'css');
  assert.deepEqual(result.shadow.innerCandidates.xpath?.validation, { status: 'unique', count: 1, matchesTarget: true });
  assert.equal(result.shadow.innerCandidates.xpath?.selector, '/button[1]');
  assert.equal(result.shadow.innerCandidates.xpath?.kind, 'shadow-root-relative-xpath');
  assert.deepEqual(result.shadow.innerCandidates.css?.validation, { status: 'unique', count: 1, matchesTarget: true });
  assert.equal(result.shadow.innerCandidates.css?.kind, 'css');
  assert.notEqual(result.shadow.hostCandidates.xpath?.kind, 'document-absolute-xpath');
  assert.notEqual(result.shadow.innerCandidates.xpath?.kind, 'document-absolute-xpath');
  const documentAbsoluteXPath: ShadowSelectorKind = 'document-absolute-xpath';
  assert.notEqual(result.shadow.innerCandidates.xpath?.kind, documentAbsoluteXPath);
});
test('closed Shadow DOM 不验证内部候选', () => {
  const dom = new JSDOM('<body><div id="host"></div></body>');
  const host = dom.window.document.querySelector('#host')!;
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = '<button>保存</button>';
  const inner = root.querySelector('button')!;
  const evaluator: Evaluator = {
    evaluateXPath(xpath, target) {
      assert.notEqual(xpath, '/button[1]', 'closed Shadow 不应验证 inner XPath');
      return { status: 'unique', count: 1, matchesTarget: target === host };
    },
    evaluateCss(selector, target) {
      assert.notEqual(selector, 'button:nth-child(1)', 'closed Shadow 不应验证 inner CSS');
      return { status: 'unique', count: 1, matchesTarget: target === host };
    },
  };

  const result = generateLocator(inner, evaluator, dom.window as unknown as Window);

  assert.equal(result.shadow.innerCandidates.xpath, null);
  assert.equal(result.shadow.innerCandidates.css, null);
});
test('库入口不暴露扩展交互 API', () => {
  const source = readFileSync(new URL('../src/library/index.ts', import.meta.url), 'utf8');
  for (const forbidden of [
    'chrome.',
    'addEventListener',
    'renderLocatorWithPick',
    'createContextMenu',
    '.css',
    'window',
    'document',
  ]) {
    assert.equal(source.includes(forbidden), false, `入口不应包含 ${forbidden}`);
  }
});
