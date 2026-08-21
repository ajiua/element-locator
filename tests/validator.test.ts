import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDomEvaluator } from '../src/content/validator';

test('CSS: unique match', () => {
  const dom = new JSDOM('<body><button id="query">x</button></body>');
  const btn = dom.window.document.querySelector('button')!;
  const r = createDomEvaluator(dom.window.document).evaluateCss('#query', btn);
  assert.equal(r.status, 'unique');
  assert.equal(r.matchesTarget, true);
});

test('CSS: multiple match', () => {
  const dom = new JSDOM('<body><button class="btn">a</button><button class="btn">b</button></body>');
  const btn = dom.window.document.querySelector('button')!;
  const r = createDomEvaluator(dom.window.document).evaluateCss('.btn', btn);
  assert.equal(r.status, 'multiple');
  assert.equal(r.count, 2);
  assert.equal(r.matchesTarget, false);
});

test('CSS: no match', () => {
  const dom = new JSDOM('<body><button id="query">x</button></body>');
  const btn = dom.window.document.querySelector('button')!;
  const r = createDomEvaluator(dom.window.document).evaluateCss('.missing', btn);
  assert.equal(r.status, 'none');
});

test('CSS: invalid selector -> error', () => {
  const dom = new JSDOM('<body></body>');
  const btn = dom.window.document.body;
  const r = createDomEvaluator(dom.window.document).evaluateCss('##bad', btn);
  assert.equal(r.status, 'error');
});

test('XPath in jsdom -> error (document.evaluate unavailable), must not throw', () => {
  const dom = new JSDOM('<body><button id="query">x</button></body>');
  const btn = dom.window.document.querySelector('button')!;
  const r = createDomEvaluator(dom.window.document).evaluateXPath('//button', btn);
  assert.equal(r.status, 'error');
});
