import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { describeFrameElement, getFrameInfo } from '../src/content/frame';

test('getFrameInfo: top-level window is not a frame', () => {
  const dom = new JSDOM('<body></body>');
  const info = getFrameInfo(dom.window as unknown as Window);
  assert.equal(info.inFrame, false);
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
  });
});
