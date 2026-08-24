// src/content/locator.ts
// 编排管线：候选生成 → 验证 → 评分 → 选优。

import {
  buildXPathCandidates,
  buildPositionalCandidates,
  buildAbsoluteXPath,
  buildAncestorConstraint,
  withAncestorConstraint,
  buildStructuralXPathCandidates,
  buildStructuralXPathDepth,
} from './xpath-generator';
import {
  buildCssCandidates,
  buildCssStructural,
  cssAncestorConstraint,
  buildStructuralCssCandidates,
  buildStructuralCssDepth,
} from './css-generator';
import { scoreCandidate } from './scorer';
import { detectShadow } from './shadow';
import { getFrameInfo } from './frame';
import type {
  Candidate,
  Evaluator,
  ShadowInfo,
  ValidationResult,
  GenerateOptions,
  LocatorChoice,
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

function isValid(c: Candidate): boolean {
  return c.validation?.status === 'unique' && c.validation.matchesTarget;
}

function finish(all: Candidate[]): LocatorChoice {
  for (const c of all) c.score = scoreCandidate(c);
  all.sort((a, b) => b.score - a.score);
  return { best: all.find(isValid) ?? null, all };
}

function withoutText(all: Candidate[], opts: GenerateOptions): Candidate[] {
  return opts.structuralOnly ? all.filter((c) => c.kind !== 'text') : all;
}

function buildXPathChoice(el: Element, ev: Evaluator, opts: GenerateOptions): LocatorChoice {
  let all: Candidate[] = [];
  for (const cand of buildXPathCandidates(el)) {
    cand.validation = ev.evaluateXPath(cand.selector, el);
    all.push(cand);
    // 多匹配候选需要父级缩小范围；文本候选始终补充稳定祖先版本，优先使用局部语义。
    if (cand.validation.status === 'multiple' || cand.kind === 'text') {
      const constraint = buildAncestorConstraint(el);
      if (constraint) {
        const stronger: Candidate = {
          ...cand,
          selector: withAncestorConstraint(constraint, cand.selector),
          parentContext: true,
          reason: `${cand.reason} (in parent context)`,
        };
        stronger.validation = ev.evaluateXPath(stronger.selector, el);
        all.push(stronger);
      }
    }
  }
  for (const cand of buildPositionalCandidates(el)) {
    cand.validation = ev.evaluateXPath(cand.selector, el);
    all.push(cand);
  }
  for (const cand of buildStructuralXPathCandidates(el)) {
    cand.validation = ev.evaluateXPath(cand.selector, el);
    all.push(cand);
  }
  if (opts.structuralOnly && opts.structuralDepth && opts.structuralDepth > 0) {
    const depthCand = buildStructuralXPathDepth(el, opts.structuralDepth);
    if (depthCand) {
      depthCand.validation = ev.evaluateXPath(depthCand.selector, el);
      all.push(depthCand);
    }
  }
  const abs = buildAbsoluteXPath(el);
  abs.validation = ev.evaluateXPath(abs.selector, el);
  all.push(abs);
  all = withoutText(all, opts);
  return finish(all);
}

function buildCssChoice(el: Element, ev: Evaluator, opts: GenerateOptions): LocatorChoice {
  let all: Candidate[] = [];
  for (const cand of buildCssCandidates(el)) {
    cand.validation = ev.evaluateCss(cand.selector, el);
    all.push(cand);
    // 仅当朴素定位器不唯一时才加父级上下文（设计§5.1）。
    if (cand.validation.status === 'multiple') {
      const constraint = cssAncestorConstraint(el);
      if (constraint) {
        const stronger: Candidate = {
          ...cand,
          selector: `${constraint} ${cand.selector}`,
          parentContext: true,
          reason: `${cand.reason} (in parent context)`,
        };
        stronger.validation = ev.evaluateCss(stronger.selector, el);
        all.push(stronger);
      }
    }
  }
  const structural = buildCssStructural(el);
  if (structural) {
    structural.validation = ev.evaluateCss(structural.selector, el);
    all.push(structural);
  }
  for (const cand of buildStructuralCssCandidates(el)) {
    cand.validation = ev.evaluateCss(cand.selector, el);
    all.push(cand);
  }
  if (opts.structuralOnly && opts.structuralDepth && opts.structuralDepth > 0) {
    const depthCand = buildStructuralCssDepth(el, opts.structuralDepth);
    if (depthCand) {
      depthCand.validation = ev.evaluateCss(depthCand.selector, el);
      all.push(depthCand);
    }
  }
  all = withoutText(all, opts);
  return finish(all);
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
