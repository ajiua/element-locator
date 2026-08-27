// src/content/locator.ts
// 编排管线：目标描述 → shadow 校验 → 复用共享的候选生成与选优管线。

import { buildCssChoice, buildXPathChoice } from './locator-choice';
import { detectShadow } from './shadow';
import { getFrameInfo } from './frame';
import type {
  Evaluator,
  ShadowInfo,
  ValidationResult,
  GenerateOptions,
  LocatorResult,
  TargetInfo,
} from './types';

function describeTarget(el: Element): TargetInfo {
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    id: el.getAttribute('id'),
    classes: (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean),
  };
}

interface ShadowValidationContext {
  root: ShadowRoot;
  host: Element;
  innerTarget: Element;
  closed: boolean;
}

function shadowValidationResult(count: number, first: Node | null, target: Element): ValidationResult {
  return {
    status: count === 1 ? 'unique' : count > 1 ? 'multiple' : 'none',
    count,
    matchesTarget: count === 1 && first === target,
  };
}

function evaluateShadowCss(root: ShadowRoot, selector: string, target: Element): ValidationResult {
  try {
    const nodes = root.querySelectorAll(selector);
    return shadowValidationResult(nodes.length, nodes[0] ?? null, target);
  } catch {
    return { status: 'error', count: 0, matchesTarget: false };
  }
}

function evaluateShadowXPath(root: ShadowRoot, xpath: string, target: Element): ValidationResult {
  const doc = root.ownerDocument;
  const XPathResult = doc.defaultView?.XPathResult;
  if (!XPathResult) return { status: 'error', count: 0, matchesTarget: false };
  try {
    const result = doc.evaluate(`.${xpath}`, root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return shadowValidationResult(result.snapshotLength, result.snapshotItem(0), target);
  } catch {
    return { status: 'error', count: 0, matchesTarget: false };
  }
}

function resolveShadowValidationContext(el: Element): ShadowValidationContext | null {
  try {
    let node = el;
    let root = node.getRootNode();
    const shadowRootCtor = (node.ownerDocument.defaultView as unknown as {
      ShadowRoot?: new () => ShadowRoot;
    })?.ShadowRoot;
    let context: ShadowValidationContext | null = null;
    while (shadowRootCtor && root instanceof shadowRootCtor) {
      const host = root.host as Element;
      context = { root, host, innerTarget: node, closed: host.shadowRoot === null };
      node = host;
      root = node.getRootNode();
    }
    return context;
  } catch {
    return null;
  }
}

function validateShadowCandidates(shadow: ShadowInfo, el: Element, ev: Evaluator): void {
  const context = resolveShadowValidationContext(el);
  if (!context) return;

  if (shadow.hostCandidates.xpath) {
    shadow.hostCandidates.xpath.validation = ev.evaluateXPath(shadow.hostCandidates.xpath.selector, context.host);
  }
  if (shadow.hostCandidates.css) {
    shadow.hostCandidates.css.validation = ev.evaluateCss(shadow.hostCandidates.css.selector, context.host);
  }
  if (context.closed) return;

  if (shadow.innerCandidates.xpath) {
    shadow.innerCandidates.xpath.validation = evaluateShadowXPath(
      context.root,
      shadow.innerCandidates.xpath.selector,
      context.innerTarget,
    );
  }
  if (shadow.innerCandidates.css) {
    shadow.innerCandidates.css.validation = evaluateShadowCss(
      context.root,
      shadow.innerCandidates.css.selector,
      context.innerTarget,
    );
  }
}
export function generateLocator(
  el: Element,
  ev: Evaluator,
  win: Window = window,
  opts: GenerateOptions = {},
): LocatorResult {
  const shadow = detectShadow(el);
  validateShadowCandidates(shadow, el, ev);
  return {
    target: describeTarget(el),
    frame: getFrameInfo(win),
    shadow,
    xpath: buildXPathChoice(el, ev, opts),
    css: buildCssChoice(el, ev, opts),
  };
}
