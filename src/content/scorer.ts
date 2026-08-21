// src/content/scorer.ts
// 稳定性评分：稳定性 > 唯一性 > 可读性 > 长度。

import type { Candidate, SelectorKind } from './types';

const BASE_SCORE: Record<SelectorKind, number> = {
  id: 100,
  'data-testid': 90,
  data: 60,
  name: 80,
  aria: 75,
  placeholder: 70,
  title: 65,
  class: 50,
  text: 40,
  href: 85,
  parent: 30,
  position: -30,
  absolute: -100,
};

const PARENT_CONTEXT_BONUS = 30;

export function scoreCandidate(c: Pick<Candidate, 'kind' | 'parentContext' | 'tagExact'>): number {
  let s = BASE_SCORE[c.kind] ?? 0;
  if (c.parentContext) s += PARENT_CONTEXT_BONUS;
  if (c.tagExact) s += 5;
  return s;
}
