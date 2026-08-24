import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createDomEvaluator, generateLocator } from '../src/library/index';
import type { Evaluator } from '../src/content/types';

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
