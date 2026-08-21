import { test } from 'node:test';
import assert from 'node:assert/strict';

type SendOptions = { frameId?: number } | undefined;
type SendCall = { tabId: number; options: SendOptions };
type MenuListener = (info: { menuItemId: string; frameId?: number }, tab?: { id?: number }) => void;

const calls: SendCall[] = [];
let failures: Array<string | null> = [];
let menuListener: MenuListener | null = null;

const runtime: { lastError?: { message: string } } = {};
(globalThis as Record<string, unknown>).chrome = {
  runtime: {
    ...runtime,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
  },
  contextMenus: {
    removeAll(callback: () => void) { callback(); },
    create() {},
    onClicked: { addListener(fn: MenuListener) { menuListener = fn; } },
  },
  tabs: {
    sendMessage(tabId: number, _payload: unknown, optionsOrCallback: SendOptions | (() => void), maybeCallback?: () => void) {
      const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
      calls.push({ tabId, options });
      const error = failures.shift() ?? null;
      const chromeRuntime = (globalThis as any).chrome.runtime;
      chromeRuntime.lastError = error ? { message: error } : undefined;
      callback();
      chromeRuntime.lastError = undefined;
    },
  },
};

await import('../src/background/background');
assert.ok(menuListener);

test('failed target frame falls back explicitly to the main frame', () => {
  calls.length = 0;
  failures = ['stale frame', null];
  menuListener!({ menuItemId: 'generate-element-locator', frameId: 7 }, { id: 42 });
  assert.deepEqual(calls, [
    { tabId: 42, options: { frameId: 7 } },
    { tabId: 42, options: { frameId: 0 } },
  ]);
});

test('failed main-frame delivery is not retried', () => {
  calls.length = 0;
  failures = ['missing receiver'];
  menuListener!({ menuItemId: 'generate-element-locator', frameId: 0 }, { id: 42 });
  assert.deepEqual(calls, [{ tabId: 42, options: { frameId: 0 } }]);
});
