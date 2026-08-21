// src/content/xpath-generator.ts
// 按策略优先级生成 XPath 候选表达式。

import {
  isStableId,
  getTestIdAttribute,
  getStableClass,
  getGenericDataAttribute,
  getAriaAttribute,
} from './stability';
import type { Candidate } from './types';

export function xpathStringLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  const parts = value.split("'");
  return `concat(${parts.map((p) => `'${p}'`).join(", \"'\", ")})`;
}

function normalizedText(el: Element): string | null {
  const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 0 && t.length <= 80 ? t : null;
}

function base(kind: Candidate['kind'], reason: string): Candidate {
  return { selector: '', kind, score: 0, reason, parentContext: false, tagExact: false };
}

function classTokenPredicate(cls: string): string {
  return `contains(concat(' ', normalize-space(@class), ' '), ${xpathStringLiteral(` ${cls} `)})`;
}

export function buildXPathCandidates(el: Element): Candidate[] {
  const out: Candidate[] = [];
  const tag = el.tagName.toLowerCase();

  const id = el.getAttribute('id');
  if (id && isStableId(id)) {
    out.push({ ...base('id', `id: ${id}`), selector: `//*[@id=${xpathStringLiteral(id)}]` });
    out.push({ ...base('id', `id: ${id}`), selector: `//${tag}[@id=${xpathStringLiteral(id)}]`, tagExact: true });
  }

  const testIdAttr = getTestIdAttribute(el);
  if (testIdAttr) {
    const [attr, testid] = testIdAttr;
    out.push({ ...base('data-testid', `${attr}: ${testid}`), selector: `//*[@${attr}=${xpathStringLiteral(testid)}]` });
    out.push({ ...base('data-testid', `${attr}: ${testid}`), selector: `//${tag}[@${attr}=${xpathStringLiteral(testid)}]`, tagExact: true });
  } else {
    const generic = getGenericDataAttribute(el);
    if (generic) {
      const [attr, v] = generic;
      out.push({ ...base('data', `${attr}: ${v}`), selector: `//*[@${attr}=${xpathStringLiteral(v)}]` });
    }
  }

  const name = el.getAttribute('name');
  if (name && name.trim()) {
    out.push({ ...base('name', `name: ${name}`), selector: `//*[@name=${xpathStringLiteral(name)}]` });
    out.push({ ...base('name', `name: ${name}`), selector: `//${tag}[@name=${xpathStringLiteral(name)}]`, tagExact: true });
  }

  const aria = getAriaAttribute(el);
  if (aria) {
    const [attr, v] = aria;
    out.push({ ...base('aria', `${attr}: ${v}`), selector: `//*[@${attr}=${xpathStringLiteral(v)}]` });
  }

  const ph = el.getAttribute('placeholder');
  if (ph && ph.trim()) {
    out.push({ ...base('placeholder', `placeholder: ${ph}`), selector: `//*[@placeholder=${xpathStringLiteral(ph)}]` });
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) {
    out.push({ ...base('title', `title: ${title}`), selector: `//*[@title=${xpathStringLiteral(title)}]` });
  }

  const text = normalizedText(el);
  if (text) {
    out.push({ ...base('text', `text: ${text}`), selector: `//${tag}[normalize-space()=${xpathStringLiteral(text)}]`, tagExact: true });
  }

  const cls = getStableClass(el);
  if (cls) {
    const pred = classTokenPredicate(cls);
    out.push({ ...base('class', `class: ${cls}`), selector: `//*[${pred}]` });
    out.push({ ...base('class', `class: ${cls}`), selector: `//${tag}[${pred}]`, tagExact: true });
  }

  // 链接：用 href（去 query/fragment）定位，不依赖链接文字。
  if (tag === 'a' || tag === 'area') {
    const href = el.getAttribute('href');
    if (href && href.trim()) {
      const part = href.split(/[?#]/)[0].trim();
      if (part) {
        const lit = xpathStringLiteral(part);
        const queryPrefix = xpathStringLiteral(`${part}?`);
        const fragmentPrefix = xpathStringLiteral(`${part}#`);
        out.push({
          ...base('href', `href: ${part}`),
          selector: `//${tag}[@href=${lit} or starts-with(@href, ${queryPrefix}) or starts-with(@href, ${fragmentPrefix})]`,
          tagExact: true,
        });
      }
    }
  }

  return out;
}

function stablePredicate(el: Element): string | null {
  const id = el.getAttribute('id');
  if (id && isStableId(id)) {
    const lit = xpathStringLiteral(id);
    if (lit) return `@id=${lit}`;
  }
  const testIdAttr = getTestIdAttribute(el);
  if (testIdAttr) {
    const [attr, testid] = testIdAttr;
    return `@${attr}=${xpathStringLiteral(testid)}`;
  }
  const name = el.getAttribute('name');
  if (name && name.trim()) {
    const lit = xpathStringLiteral(name);
    if (lit) return `@name=${lit}`;
  }
  const cls = getStableClass(el);
  if (cls) return classTokenPredicate(cls);
  return null;
}

// 结构式定位：从最近的带稳定标识的祖先开始，逐层外推，给出一套
// `//*[祖先标识]/下一级[序号]/…/当前元素[序号]` 的候选（不依赖文字）。
export function buildStructuralXPathCandidates(el: Element): Candidate[] {
  const out: Candidate[] = [];
  let root: Element | null = el.parentElement;
  while (root && root !== el.ownerDocument.documentElement) {
    const pred = stablePredicate(root);
    if (pred) {
      out.push({
        ...base('parent', `structural within ${pred}`),
        selector: `//*[${pred}]${relativeXPathPath(el, root)}`,
      });
    }
    root = root.parentElement;
  }
  return out;
}

// 指定"往上查找 N 个父级"的锚点定位：第 N 级祖先用其序号区分，
// 若该级没有稳定标识则顺带引用其上方最近的稳定祖先来消歧，
// 得到如 `//*[contains(@class,'clearfix')]/li[2]/p[5]/span[1]`。
export function buildStructuralXPathDepth(el: Element, depth: number): Candidate | null {
  if (depth < 1) return null;
  const ancs: Element[] = [el];
  let a: Element | null = el.parentElement;
  while (a && a !== el.ownerDocument.documentElement) {
    ancs.push(a);
    a = a.parentElement;
  }
  // ancs[0]=el, ancs[k]=第 k 级祖先；第 depth 级祖先需存在。
  if (depth >= ancs.length) return null;
  let stableIdx = depth;
  while (stableIdx < ancs.length && !stablePredicate(ancs[stableIdx])) stableIdx++;
  if (stableIdx >= ancs.length) return null;
  const pred = stablePredicate(ancs[stableIdx])!;
  return {
    ...base('parent', `depth ${depth} within ${pred}`),
    selector: `//*[${pred}]${relativeXPathPath(el, ancs[stableIdx])}`,
    parentContext: true,
  };
}

// 向上找最近的、带有稳定标识的祖先元素。
export function findAncestorAnchor(el: Element): Element | null {
  let node = el.parentElement;
  while (node && node !== el.ownerDocument.documentElement) {
    const id = node.getAttribute('id');
    if (id && isStableId(id)) return node;
    if (getTestIdAttribute(node)) return node;
    const name = node.getAttribute('name');
    if (name && name.trim()) return node;
    if (getStableClass(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function describeAnchor(anchor: Element): string | null {
  const id = anchor.getAttribute('id');
  if (id && isStableId(id)) return `//${anchor.tagName.toLowerCase()}[@id=${xpathStringLiteral(id)}]`;
  const testIdAttr = getTestIdAttribute(anchor);
  if (testIdAttr) {
    const [attr, testid] = testIdAttr;
    return `//*[@${attr}=${xpathStringLiteral(testid)}]`;
  }
  const name = anchor.getAttribute('name');
  if (name && name.trim()) return `//${anchor.tagName.toLowerCase()}[@name=${xpathStringLiteral(name)}]`;
  const cls = getStableClass(anchor);
  if (cls) return `//*[${classTokenPredicate(cls)}]`;
  return null;
}

export function buildAncestorConstraint(el: Element): string | null {
  const anchor = findAncestorAnchor(el);
  return anchor ? describeAnchor(anchor) : null;
}

export function withAncestorConstraint(constraint: string, selector: string): string {
  const body = selector.startsWith('//') ? selector : `//${selector}`;
  return `${constraint}${body}`;
}

function childIndex(node: Element): number {
  const parent = node.parentElement;
  if (!parent) return 1;
  const kids = parent.children;
  for (let i = 0; i < kids.length; i++) if (kids[i] === node) return i + 1;
  return 1;
}

function relativeXPathPath(node: Element, stopAt: Element): string {
  const parts: string[] = [];
  let cur: Element | null = node;
  while (cur && cur !== stopAt && cur.parentElement) {
    const tag = cur.tagName.toLowerCase();
    parts.unshift(`${tag}[${childIndex(cur)}]`);
    cur = cur.parentElement;
  }
  return '/' + parts.join('/');
}

export function buildPositionalCandidates(el: Element): Candidate[] {
  const out: Candidate[] = [];
  const tag = el.tagName.toLowerCase();

  const all = el.ownerDocument.querySelectorAll(tag);
  let pos = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i] === el) { pos = i + 1; break; }
  }
  if (pos > 0) {
    out.push({ ...base('position', `position ${pos} of ${tag}`), selector: `(//${tag})[${pos}]` });
  }

  const anchor = findAncestorAnchor(el);
  if (anchor) {
    const constraint = describeAnchor(anchor)!;
    const path = relativeXPathPath(el, anchor);
    out.push({ ...base('parent', `within ${constraint}`), selector: `${constraint}${path}` });
  }
  return out;
}

export function buildAbsoluteXPath(el: Element): Candidate {
  const path = relativeXPathPath(el, el.ownerDocument.documentElement);
  return { ...base('absolute', 'absolute path'), selector: `/html${path}` };
}
