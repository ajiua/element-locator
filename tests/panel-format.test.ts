import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starsFor, statusText, esc } from '../src/content/panel-format';

test('starsFor maps score to stars', () => {
  assert.equal(starsFor(100), '★★★★★');
  assert.equal(starsFor(80), '★★★★☆');
  assert.equal(starsFor(40), '★★☆☆☆');
  assert.equal(starsFor(-100), '☆☆☆☆☆');
});

test('statusText formats validation', () => {
  assert.equal(statusText({ status: 'unique', count: 1, matchesTarget: true }), '✓ 唯一匹配');
  assert.equal(statusText({ status: 'unique', count: 1, matchesTarget: false }), '✓ 唯一（未命中目标）');
  assert.equal(statusText({ status: 'multiple', count: 3, matchesTarget: false }), '✗ 匹配 3 个元素');
  assert.equal(statusText({ status: 'none', count: 0, matchesTarget: false }), '✗ 无匹配');
  assert.equal(statusText({ status: 'error', count: 0, matchesTarget: false }), '✗ 表达式无效');
  assert.equal(statusText(undefined), '未验证');
});

test('esc escapes html', () => {
  assert.equal(esc('<a b="c">'), '&lt;a b=&quot;c&quot;&gt;');
});
