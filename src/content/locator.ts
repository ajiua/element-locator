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

export function generateLocator(
  el: Element,
  ev: Evaluator,
  win: Window = window,
  opts: GenerateOptions = {},
): LocatorResult {
  return {
    target: describeTarget(el),
    frame: getFrameInfo(win),
    shadow: detectShadow(el),
    xpath: buildXPathChoice(el, ev, opts),
    css: buildCssChoice(el, ev, opts),
  };
}
