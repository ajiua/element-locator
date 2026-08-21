// src/content/frame.ts
// 检测目标元素所在的 frame 上下文，供面板提示"需先进入 iframe"。

import { cssAttrString } from './css-generator';
import type { FrameInfo } from './types';

export function describeFrameElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const name = el.getAttribute('name');
  if (name && name.trim()) return `${tag}[name=${cssAttrString(name)}]`;
  const id = el.getAttribute('id');
  if (id && id.trim()) return `${tag}[id=${cssAttrString(id)}]`;
  const parent = el.parentElement;
  let idx = 0;
  if (parent) {
    const kids = parent.children;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].tagName.toLowerCase() === tag) idx++;
      if (kids[i] === el) break;
    }
  }
  return `${tag}[${idx}]`;
}

export function getFrameInfo(win: Window): FrameInfo {
  const url = win.location.href;
  if (win.self === win.top) {
    return { inFrame: false, path: '', url, sameOrigin: true };
  }
  try {
    const pathParts: string[] = [];
    let cur: Window = win;
    while (cur !== cur.top && cur.frameElement) {
      pathParts.unshift(describeFrameElement(cur.frameElement));
      cur = cur.parent;
    }
    if (pathParts.length === 0) {
      return { inFrame: true, path: '(cross-origin iframe)', url, sameOrigin: false };
    }
    return { inFrame: true, path: pathParts.join(' > '), url, sameOrigin: true };
  } catch {
    // 跨域 iframe 访问 frameElement/parent 会抛错，无法得出路径；按跨域处理。
    return { inFrame: true, path: '(cross-origin iframe)', url, sameOrigin: false };
  }
}
