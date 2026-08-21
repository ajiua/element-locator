// src/content/render.ts
// 把目标元素及其祖先链交给定位管线，渲染面板，并支持在面包屑里切换层级重新生成。
// 供 content.ts（网页右键捕获）与 inspected.ts（DevTools $0）共用。

import { generateLocator } from './locator';
import { showPanel } from './panel';
import type { Evaluator, GenerateOptions } from './types';

const MAX_DEPTH = 10;

export function ancestorChain(target: Element): Element[] {
  const chain: Element[] = [];
  let n: Element | null = target;
  while (n && chain.length < MAX_DEPTH) {
    chain.push(n);
    if (n.tagName.toLowerCase() === 'body') break;
    n = n.parentElement;
  }
  return chain;
}

export function renderLocatorWithPick(
  target: Element,
  ev: Evaluator,
  win: Window = window,
  opts: GenerateOptions = {},
): void {
  const chain = ancestorChain(target);
  const buildAncestors = (sel: number) =>
    chain.map((el, i) => ({
      tag: el.tagName.toLowerCase(),
      id: el.getAttribute('id'),
      classes: (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 3),
      selected: i === sel,
    }));
  const renderFor = (idx: number, structural: boolean, depth: number): void => {
    showPanel(generateLocator(chain[idx], ev, win, { structuralOnly: structural, structuralDepth: depth }), {
      ancestors: buildAncestors(idx),
      structural,
      structuralDepth: depth,
      onPick: (i) => renderFor(i, structural, depth),
      onStructuralChange: (s, d) => renderFor(idx, s, d),
    });
  };
  renderFor(0, !!opts.structuralOnly, opts.structuralDepth ?? 0);
}
