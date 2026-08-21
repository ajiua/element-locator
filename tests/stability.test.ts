import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { isStableId, isStableClass, getTestId, getStableClass } from '../src/content/stability';

test('isStableId accepts normal ids', () => {
  assert.equal(isStableId('query'), true);
  assert.equal(isStableId('search-area'), true);
  assert.equal(isStableId('a1'), true);
});

test('isStableId rejects dynamic ids', () => {
  assert.equal(isStableId('ember482'), false);
  assert.equal(isStableId('ext-gen123'), false);
  assert.equal(isStableId('__BVID__3'), false);
  assert.equal(isStableId('vue-app'), false);
  assert.equal(isStableId(''), false);
  assert.equal(isStableId('a'), false);
});

test('isStableClass accepts normal classes', () => {
  assert.equal(isStableClass('el-button'), true);
  assert.equal(isStableClass('primary'), true);
  assert.equal(isStableClass('search-result'), true);
  assert.equal(isStableClass('weather-item'), true);
  assert.equal(isStableClass('open-source'), true);
  assert.equal(isStableClass('active-directory'), true);
});

test('isStableClass rejects generated classes', () => {
  assert.equal(isStableClass('css-abc123'), false);
  assert.equal(isStableClass('_ngcontent-asdfg'), false);
  assert.equal(isStableClass('ng-star-inserted'), false);
  assert.equal(isStableClass('abcdef'), false);
});

test('isStableClass rejects transient UI state classes', () => {
  for (const cls of [
    'hover', 'over', 'active', 'focus', 'focused',
    'selected', 'select', 'unselect', 'unselected',
    'unselct', 'unselcted', 'current', 'on', 'off',
    'open', 'closed', 'show', 'hidden', 'disabled', 'checked',
    'is-active', 'has-focus',
  ]) {
    assert.equal(isStableClass(cls), false, cls);
  }
});

test('getTestId prefers known test id attributes', () => {
  const dom = new JSDOM('<button data-qa="btn" data-testid="submit">x</button>');
  const el = dom.window.document.querySelector('button')!;
  assert.equal(getTestId(el), 'submit');
});

test('getStableClass preserves author class order', () => {
  const dom = new JSDOM('<button class="semantic very-long-utility-name css-junk">x</button>');
  const el = dom.window.document.querySelector('button')!;
  assert.equal(getStableClass(el), 'semantic');
});
