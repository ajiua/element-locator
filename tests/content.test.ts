import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// content.ts registers `document.addEventListener('contextmenu', …)` and
// `chrome.runtime.onMessage.addListener(...)` at module load, referencing browser
// globals. To drive it in Node we seed those globals and import the module once at
// top-level (capturing the message listener), then exercise both capture outcomes
// against the SAME jsdom document the listener is registered on.
type Listener = (
  msg: unknown,
  _sender: unknown,
  sendResponse: (r: Record<string, unknown>) => void,
) => boolean | void;

const dom = new JSDOM(
  '<!DOCTYPE html><html><body><button id="go">go</button></body></html>',
);
const win = dom.window;
(globalThis as Record<string, unknown>).window = win;
(globalThis as Record<string, unknown>).document = win.document;
(globalThis as Record<string, unknown>).Element = win.Element;

let listener: Listener | null = null;
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    onMessage: {
      addListener(fn: Listener) {
        listener = fn;
      },
    },
  },
};

await import('../src/content/content');
assert.ok(listener, 'message listener should be registered at module load');

function invoke(msg: unknown): Record<string, unknown> {
  let resp: Record<string, unknown> | undefined;
  listener!(
    msg,
    {},
    (r) => {
      resp = r;
    },
  );
  assert.ok(resp, 'sendResponse should be called');
  return resp!;
}

test('content GENERATE returns error when no target was captured', () => {
  const resp = invoke({ type: 'GENERATE' });
  assert.equal(resp.ok, false);
  assert.ok(typeof resp.error === 'string' && resp.error.length > 0);
});

test('content GENERATE returns ok when a target was captured via contextmenu', () => {
  const target = win.document.querySelector('#go')!;
  target.dispatchEvent(
    new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
  );

  const resp = invoke({ type: 'GENERATE' });
  assert.equal(resp.ok, true);
});
