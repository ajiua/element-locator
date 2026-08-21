// src/content/css-generator.ts
// 生成 CSS Selector 候选表达式。

import {
  isStableId,
  getTestIdAttribute,
  getStableClass,
  getGenericDataAttribute,
  getAriaAttribute,
} from './stability';
import { findAncestorAnchor } from './xpath-generator';
import type { Candidate } from './types';

export function escapeCssIdentifier(ident: string): string {
  let out = '';
  for (let i = 0; i < ident.length; i++) {
    const ch = ident[i];
    if (/^[a-zA-Z0-9_-]$/.test(ch) && !(i === 0 && /^[0-9]/.test(ch))) {
      out += ch;
    } else {
      out += '\\' + ch.codePointAt(0)!.toString(16) + ' ';
    }
  }
  return out;
}

export function cssAttrString(value: string): string {
  return "'" + value.replace(/['\\\n\r\f]/g, (m) => '\\' + m) + "'";
}

function base(kind: Candidate['kind'], reason: string): Candidate {
  return { selector: '', kind, score: 0, reason, parentContext: false, tagExact: false };
}

export function buildCssCandidates(el: Element): Candidate[] {
  const out: Candidate[] = [];

  const id = el.getAttribute('id');
  if (id && isStableId(id)) {
    out.push({ ...base('id', `id: ${id}`), selector: `#${escapeCssIdentifier(id)}` });
  }

  const testIdAttr = getTestIdAttribute(el);
  if (testIdAttr) {
    const [attr, testid] = testIdAttr;
    out.push({ ...base('data-testid', `${attr}: ${testid}`), selector: `[${attr}=${cssAttrString(testid)}]` });
  } else {
    const generic = getGenericDataAttribute(el);
    if (generic) {
      const [attr, value] = generic;
      out.push({ ...base('data', `${attr}: ${value}`), selector: `[${attr}=${cssAttrString(value)}]` });
    }
  }

  const name = el.getAttribute('name');
  if (name && name.trim()) {
    out.push({ ...base('name', `name: ${name}`), selector: `[name=${cssAttrString(name)}]` });
  }

  const aria = getAriaAttribute(el);
  if (aria) {
    const [attr, v] = aria;
    out.push({ ...base('aria', `${attr}: ${v}`), selector: `[${attr}=${cssAttrString(v)}]` });
  }

  const ph = el.getAttribute('placeholder');
  if (ph && ph.trim()) {
    out.push({ ...base('placeholder', `placeholder: ${ph}`), selector: `[placeholder=${cssAttrString(ph)}]` });
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) {
    out.push({ ...base('title', `title: ${title}`), selector: `[title=${cssAttrString(title)}]` });
  }

  const cls = getStableClass(el);
  if (cls) {
    out.push({ ...base('class', `class: ${cls}`), selector: `.${escapeCssIdentifier(cls)}` });
  }

  // 链接：用 href（去 query/fragment）定位，不依赖链接文字。
  if (el.tagName.toLowerCase() === 'a' || el.tagName.toLowerCase() === 'area') {
    const href = el.getAttribute('href');
    if (href && href.trim()) {
      const part = href.split(/[?#]/)[0].trim();
      if (part) {
        const exact = cssAttrString(part);
        const queryPrefix = cssAttrString(`${part}?`);
        const fragmentPrefix = cssAttrString(`${part}#`);
        out.push({
          ...base('href', `href: ${part}`),
          selector: `:is([href=${exact}],[href^=${queryPrefix}],[href^=${fragmentPrefix}])`,
        });
      }
    }
  }

  return out;
}

function stableCssPredicate(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id && isStableId(id)) return `#${escapeCssIdentifier(id)}`;
  const testIdAttr = getTestIdAttribute(el);
  if (testIdAttr) {
    const [attr, testid] = testIdAttr;
    return `[${attr}=${cssAttrString(testid)}]`;
  }
  const name = el.getAttribute('name');
  if (name && name.trim()) return `[name=${cssAttrString(name)}]`;
  const cls = getStableClass(el);
  if (cls) return `.${escapeCssIdentifier(cls)}`;
  return null;
}

// 结构式定位（CSS）：从最近的带稳定标识的祖先开始逐层外推，
// 给出 `祖先 > 下一级:nth-child(n) > … > 当前元素:nth-child(n)` 的候选（不依赖文字）。
export function buildStructuralCssCandidates(el: Element): Candidate[] {
  const out: Candidate[] = [];
  let root: Element | null = el.parentElement;
  while (root && root !== el.ownerDocument.documentElement) {
    const pred = stableCssPredicate(root);
    if (pred) {
      const parts: string[] = [];
      let cur: Element | null = el;
      while (cur && cur !== root) {
        const parent: Element | null = cur.parentElement;
        const tag = cur.tagName.toLowerCase();
        let idx = 1;
        if (parent) {
          const kids = parent.children;
          for (let i = 0; i < kids.length; i++) if (kids[i] === cur) { idx = i + 1; break; }
        }
        parts.unshift(`${tag}:nth-child(${idx})`);
        cur = parent;
      }
      out.push({
        ...base('parent', `structural within ${pred}`),
        selector: `${pred} > ${parts.join(' > ')}`,
      });
    }
    root = root.parentElement;
  }
  return out;
}

// 指定"往上查找 N 个父级"的锚点定位（CSS），如 `.clearfix > li:nth-child(2) > p:nth-child(5) > span:nth-child(1)`。
export function buildStructuralCssDepth(el: Element, depth: number): Candidate | null {
  if (depth < 1) return null;
  const ancs: Element[] = [el];
  let a: Element | null = el.parentElement;
  while (a && a !== el.ownerDocument.documentElement) {
    ancs.push(a);
    a = a.parentElement;
  }
  if (depth >= ancs.length) return null;
  let stableIdx = depth;
  while (stableIdx < ancs.length && !stableCssPredicate(ancs[stableIdx])) stableIdx++;
  if (stableIdx >= ancs.length) return null;
  const rootSel = stableCssPredicate(ancs[stableIdx])!;
  const parts: string[] = [];
  let cur: Element | null = el;
  const stop = ancs[stableIdx];
  while (cur && cur !== stop) {
    const parent: Element | null = cur.parentElement;
    const tag = cur.tagName.toLowerCase();
    let idx = 1;
    if (parent) {
      const kids = parent.children;
      for (let i = 0; i < kids.length; i++) if (kids[i] === cur) { idx = i + 1; break; }
    }
    parts.unshift(`${tag}:nth-child(${idx})`);
    cur = parent;
  }
  return {
    ...base('parent', `depth ${depth}`),
    selector: `${rootSel} > ${parts.join(' > ')}`,
    parentContext: true,
  };
}

export function cssAncestorConstraint(el: Element): string | null {
  const anchor = findAncestorAnchor(el);
  if (!anchor) return null;
  const id = anchor.getAttribute('id');
  if (id && isStableId(id)) return `#${escapeCssIdentifier(id)}`;
  const testIdAttr = getTestIdAttribute(anchor);
  if (testIdAttr) {
    const [attr, testid] = testIdAttr;
    return `[${attr}=${cssAttrString(testid)}]`;
  }
  const name = anchor.getAttribute('name');
  if (name && name.trim()) return `[name=${cssAttrString(name)}]`;
  const cls = getStableClass(anchor);
  if (cls) return `.${escapeCssIdentifier(cls)}`;
  return null;
}

// 结构路径，如 #search-area > div:nth-child(1) > button:nth-child(2)；
// 无稳定祖先时从 html 开始。
export function buildCssStructural(el: Element): Candidate | null {
  const anchor = findAncestorAnchor(el);
  const stop = anchor ?? el.ownerDocument.documentElement;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== stop) {
    const parent: Element | null = cur.parentElement;
    const tag = cur.tagName.toLowerCase();
    let idx = 1;
    if (parent) {
      const kids = parent.children;
      for (let i = 0; i < kids.length; i++) if (kids[i] === cur) { idx = i + 1; break; }
    }
    parts.unshift(`${tag}:nth-child(${idx})`);
    cur = parent;
  }
  if (anchor) {
    const constraint = cssAncestorConstraint(el)!;
    return { ...base('parent', `within ${constraint}`), selector: `${constraint} > ${parts.join(' > ')}` };
  }
  return { ...base('absolute', 'structural path'), selector: `html > ${parts.join(' > ')}` };
}
