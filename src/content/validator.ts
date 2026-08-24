// src/content/validator.ts
// 在当前文档中执行 XPath / CSS 求值，验证候选的唯一性与目标匹配。
// DOM 求值函数集中于此，可被 mock 替换以便单测决策逻辑。

import type { Evaluator, ValidationResult } from './types';

export function createDomEvaluator(doc: Document): Evaluator {
  return {
    evaluateXPath(xpath: string, target: Element): ValidationResult {
      if (typeof doc.evaluate !== 'function') {
        // jsdom 无 XPath 支持，按不可验证处理；真实浏览器可正常求值。
        return { status: 'error', count: 0, matchesTarget: false };
      }
      const XPathResult = doc.defaultView?.XPathResult;
      if (!XPathResult) {
        return { status: 'error', count: 0, matchesTarget: false };
      }
      try {
        const result = doc.evaluate(
          xpath,
          doc,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null,
        );
        const count = result.snapshotLength;
        const matchesTarget = count === 1 && result.snapshotItem(0) === target;
        const status = count === 1 ? 'unique' : count > 1 ? 'multiple' : 'none';
        return { status, count, matchesTarget };
      } catch {
        return { status: 'error', count: 0, matchesTarget: false };
      }
    },
    evaluateCss(selector: string, target: Element): ValidationResult {
      try {
        const nodes = doc.querySelectorAll(selector);
        const count = nodes.length;
        const matchesTarget = count === 1 && nodes[0] === target;
        const status = count === 1 ? 'unique' : count > 1 ? 'multiple' : 'none';
        return { status, count, matchesTarget };
      } catch {
        return { status: 'error', count: 0, matchesTarget: false };
      }
    },
  };
}
