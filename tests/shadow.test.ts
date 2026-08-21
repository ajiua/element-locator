import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { detectShadow } from '../src/content/shadow';

test('detects open shadow root and builds host + inner locators', () => {
  const dom = new JSDOM('<body><div id="host"></div></body>');
  const host = dom.window.document.querySelector('#host')!;
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = '<button id="inner">go</button>';
  const inner = sr.querySelector('button')!;
  const info = detectShadow(inner);
  assert.equal(info.inside, true);
  assert.equal(info.closed, false);
  assert.equal(info.hostTag, 'div');
  assert.equal(info.hostXPath, "//*[@id='host']");
  assert.equal(info.hostCss, '#host');
  assert.equal(info.innerXPath, "/button[@id='inner']");
  assert.equal(info.innerCss, '#inner');
});

test('detects closed shadow root without crashing', () => {
  const dom = new JSDOM('<body><div id="host"></div></body>');
  const host = dom.window.document.querySelector('#host')!;
  const sr = host.attachShadow({ mode: 'closed' });
  sr.innerHTML = '<button id="inner">go</button>';
  const inner = sr.querySelector('button')!;
  const info = detectShadow(inner);
  assert.equal(info.inside, true);
  assert.equal(info.closed, true);
  assert.equal(info.hostXPath, "//*[@id='host']");
  assert.equal(info.innerXPath, null);
});
