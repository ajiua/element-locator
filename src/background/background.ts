// src/background/background.ts
// 注册右键菜单，点击后按 frameId 精确通知目标 frame 生成定位器。

const MENU_ID = 'generate-element-locator';

function createMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Generate Element Locator',
      contexts: ['all'],
    });
  });
}

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

export function sendGenerateMessage(tabId: number, frameId: number): void {
  const payload = { type: 'GENERATE' };
  chrome.tabs.sendMessage(tabId, payload, { frameId }, () => {
    if (!chrome.runtime.lastError) return;
    if (frameId === 0) {
      console.warn('[Element Locator] 无法通知主 frame:', chrome.runtime.lastError.message);
      return;
    }

    // 目标 frame 可能已失效；明确降级到主 frame，不假装广播到所有 frame。
    chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[Element Locator] 无法通知目标 frame 或主 frame:', chrome.runtime.lastError.message);
      }
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  sendGenerateMessage(tab.id, info.frameId ?? 0);
});
