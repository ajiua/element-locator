// src/content/frame.ts
// 检测目标元素所在的 frame 上下文，供面板提示"需先进入 iframe"。

import { cssAttrString } from './css-generator';
import { buildCssChoice, buildXPathChoice, isVerifiedCandidate } from './locator-choice';
import { createDomEvaluator } from './validator';
import type {
  Evaluator,
  FrameInfo,
  FramePathSegment,
  FrameSelectorCandidate,
} from './types';

/**
 * 为单个 iframe 元素生成"已验证且唯一命中"的定位路径段：
 * 复用候选管线（结构化模式），仅保留 unique 且命中目标的 CSS 与非绝对 XPath 候选；
 * 按分数降序（同分 css 先于 xpath，再按选择器字典序）排序去重后，
 * 取首个作为 preferred。全部候选都不可用时返回 undefined。
 */
export function buildFramePathSegment(
  frameElement: Element,
  evaluator: Evaluator = createDomEvaluator(frameElement.ownerDocument),
): FramePathSegment | undefined {
  const css = buildCssChoice(frameElement, evaluator, { structuralOnly: true });
  const xpath = buildXPathChoice(frameElement, evaluator, { structuralOnly: true });
  const candidates: FrameSelectorCandidate[] = [
    ...css.all.filter(isVerifiedCandidate).map((candidate) => ({
      kind: 'css' as const,
      selector: candidate.selector,
      score: candidate.score,
      validation: candidate.validation!,
    })),
    ...xpath.all
      .filter((candidate) => candidate.kind !== 'absolute' && isVerifiedCandidate(candidate))
      .map((candidate) => ({
        kind: 'xpath' as const,
        selector: candidate.selector,
        score: candidate.score,
        validation: candidate.validation!,
      })),
  ];
  // 同分时 css 优先于 xpath，再按选择器字典序，保证输出确定。
  const kindOrder = { css: 0, xpath: 1 } as const;
  candidates.sort((left, right) => (
    right.score - left.score ||
    kindOrder[left.kind] - kindOrder[right.kind] ||
    left.selector.localeCompare(right.selector)
  ));
  // 按 kind + '\0' + selector 去重，保留排序后的第一个候选。
  const seen = new Set<string>();
  const deduped = candidates.filter((candidate) => {
    const key = `${candidate.kind}\0${candidate.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const preferred = deduped[0];
  return preferred ? { preferred, candidates: deduped } : undefined;
}

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

/**
 * 生成单级路径段；候选管线意外抛错（含默认求值器构建失败）时按
 * "无可用候选"处理返回 undefined，避免把生成阶段的异常误报成跨域受限。
 */
function safeBuildFramePathSegment(frameElement: Element): FramePathSegment | undefined {
  try {
    return buildFramePathSegment(frameElement);
  } catch {
    return undefined;
  }
}

/**
 * 检测当前窗口的父窗口是否跨域。
 * 当 frameElement === null 时，通过尝试访问父窗口的 document 来判断跨域边界。
 */
function isParentCrossOrigin(win: Window): boolean {
  try {
    void win.parent.document;
    return false;
  } catch {
    return true;
  }
}

export function getFrameInfo(win: Window): FrameInfo {
  const url = win.location.href;
  if (win.self === win.top) {
    return { inFrame: false, path: '', url, sameOrigin: true, locatorPath: [] };
  }
  try {
    const pathParts: string[] = [];
    const locatorPath: FramePathSegment[] = [];
    // 记录循环是否真正到达 top：中途断链时不得把半条结构化路径当成功返回。
    let reachedTop = false;
    let cur: Window = win;
    // 一次祖先遍历同时产出展示路径与结构化定位路径；
    // 对 top / frameElement / parent 的读取会因跨域抛 SecurityError，由外层 catch 统一按跨域回退。
    for (;;) {
      if (cur === cur.top) {
        reachedTop = true;
        break;
      }
      const frameElement = cur.frameElement;

      if (!frameElement) {
        if (isParentCrossOrigin(cur)) {
          return {
            inFrame: true,
            path: '(cross-origin iframe)',
            url,
            sameOrigin: false,
            locatorPath: [],
            limitation: 'cross-origin',
          };
        }

        return {
          inFrame: true,
          path: pathParts.join(' > '),
          url,
          sameOrigin: true,
          locatorPath: [],
          limitation: 'unlocatable',
        };
      }
      pathParts.unshift(describeFrameElement(frameElement));
      const segment = safeBuildFramePathSegment(frameElement);
      if (!segment) {
        // 任一级产不出候选：丢弃已收集的结构化路径，绝不返回半条路径。
        return {
          inFrame: true,
          path: pathParts.join(' > '),
          url,
          sameOrigin: true,
          locatorPath: [],
          limitation: 'unlocatable',
        };
      }
      locatorPath.unshift(segment);
      cur = cur.parent;
    }
    return { inFrame: true, path: pathParts.join(' > '), url, sameOrigin: true, locatorPath };
  } catch {
    // 跨域 iframe 访问 top/frameElement/parent 会抛错，无法得出路径；按跨域处理。
    return { inFrame: true, path: '(cross-origin iframe)', url, sameOrigin: false, locatorPath: [], limitation: 'cross-origin' };
  }
}
