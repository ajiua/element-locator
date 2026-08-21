// src/content/shadow.ts
// 检测目标元素是否位于 Shadow DOM 内，并给出 host 定位与 shadow 内相对定位。

import { isStableId, getTestId } from './stability';
import { xpathStringLiteral } from './xpath-generator';
import { escapeCssIdentifier, cssAttrString } from './css-generator';
import type { ShadowInfo } from './types';

function innerXPathFrom(node: Element): string {
  const parts: string[] = [];
  let cur: Element | null = node;
  while (cur) {
    const tag = cur.tagName.toLowerCase();
    const id = cur.getAttribute('id');
    if (id && isStableId(id)) {
      parts.unshift(`${tag}[@id=${xpathStringLiteral(id)}]`);
      break;
    }
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    let idx = 1;
    const kids = parent.children;
    for (let i = 0; i < kids.length; i++) if (kids[i] === cur) { idx = i + 1; break; }
    parts.unshift(`${tag}[${idx}]`);
    cur = parent;
  }
  if (parts.length === 0) parts.push(`${node.tagName.toLowerCase()}[1]`);
  return '/' + parts.join('/');
}

function innerCssFrom(node: Element): string {
  const parts: string[] = [];
  let cur: Element | null = node;
  while (cur) {
    const tag = cur.tagName.toLowerCase();
    const id = cur.getAttribute('id');
    if (id && isStableId(id)) {
      parts.unshift(`#${escapeCssIdentifier(id)}`);
      break;
    }
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    let idx = 1;
    const kids = parent.children;
    for (let i = 0; i < kids.length; i++) if (kids[i] === cur) { idx = i + 1; break; }
    parts.unshift(`${tag}:nth-child(${idx})`);
    cur = parent;
  }
  if (parts.length === 0) parts.push(`${node.tagName.toLowerCase()}:nth-child(1)`);
  return parts.join(' > ');
}

function simpleXPath(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id && isStableId(id)) return `//*[@id=${xpathStringLiteral(id)}]`;
  const testid = getTestId(el);
  if (testid) return `//*[@data-testid=${xpathStringLiteral(testid)}]`;
  const name = el.getAttribute('name');
  if (name && name.trim()) return `//${el.tagName.toLowerCase()}[@name=${xpathStringLiteral(name)}]`;
  return null;
}

function simpleCss(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id && isStableId(id)) return `#${escapeCssIdentifier(id)}`;
  const testid = getTestId(el);
  if (testid) return `[data-testid=${cssAttrString(testid)}]`;
  return null;
}

export function detectShadow(el: Element): ShadowInfo {
  const info: ShadowInfo = {
    inside: false,
    closed: false,
    depth: 0,
    hostTag: '',
    hostXPath: null,
    hostCss: null,
    innerXPath: null,
    innerCss: null,
  };
  try {
    let node: Element | null = el;
    let root = node.getRootNode();
    // jsdom does not expose the browser-global `ShadowRoot` (typeof ShadowRoot === 'undefined'),
    // so resolve the constructor from the node's own window realm (works in jsdom and browsers).
    const shadowRootCtor = (node.ownerDocument.defaultView as unknown as {
      ShadowRoot?: new () => ShadowRoot;
    })?.ShadowRoot;
    while (shadowRootCtor && root instanceof shadowRootCtor) {
      const host = root.host as Element;
      info.inside = true;
      info.depth += 1;
      info.hostTag = host.tagName.toLowerCase();
      info.closed = host.shadowRoot === null;
      if (!info.closed) {
        info.innerXPath = innerXPathFrom(node);
        info.innerCss = innerCssFrom(node);
      }
      info.hostXPath = simpleXPath(host);
      info.hostCss = simpleCss(host);
      node = host;
      root = node.getRootNode();
    }
  } catch {
    // Unexpected exception during shadow walking: never crash — return the
    // best-effort `info` accumulated so far (design doc §11: try/catch, no crash).
  }
  return info;
}
