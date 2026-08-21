// src/content/panel-format.ts
// 面板展示用纯格式化函数，不依赖浏览器/CSS，便于单测。

import type { ValidationResult } from './types';

export function starsFor(score: number): string {
  const n = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 30 ? 2 : score >= 0 ? 1 : 0;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function statusText(v: ValidationResult | undefined): string {
  if (!v) return '未验证';
  if (v.status === 'unique') return v.matchesTarget ? '✓ 唯一匹配' : '✓ 唯一（未命中目标）';
  if (v.status === 'multiple') return `✗ 匹配 ${v.count} 个元素`;
  if (v.status === 'none') return '✗ 无匹配';
  return '✗ 表达式无效';
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
