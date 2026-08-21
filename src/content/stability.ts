// src/content/stability.ts
// 判定 ID / class 是否"稳定"（非动态生成），以及常见定位属性提取。

const ID_BLOCKLIST: RegExp[] = [
  /^ext-gen/i,
  /^ember/i,
  /^vue-/i,
  /^__bvid__/i,
  /^ngx/i,
  /_ngcontent/i,
  /^gen_/i,
  /^dojo_/i,
];

const ID_UNSTABLE_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})|(^|[\-_])\d{5,}($|[\-_])/;

const CLASS_BLOCKLIST: RegExp[] = [
  /^css-/i,
  /_ngcontent/i,
  /^ng-star-inserted$/i,
  /^ng-host/i,
  /^ng-/i,
  /^sc-/i,
  /^_css_/i,
  /^[a-f0-9]{6,}$/i,
  /^(?:(?:is|has)-)?(?:hover|over|active|focus|focused|selected|select|unselect|unselected|unselct|unselcted|current|on|off|open|closed|show|hidden|disabled|checked)$/i,
];

export const TEST_ID_ATTRIBUTES = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-qa',
  'data-cy',
  'data-automation',
  'data-automation-id',
];

export function isStableId(id: string): boolean {
  const t = id.trim();
  if (t.length < 2 || t.length > 64) return false;
  if (ID_BLOCKLIST.some((r) => r.test(t))) return false;
  if (ID_UNSTABLE_PATTERN.test(t)) return false;
  return true;
}

export function isStableClass(cls: string): boolean {
  const t = cls.trim();
  if (t.length < 2 || t.length > 64) return false;
  if (CLASS_BLOCKLIST.some((r) => r.test(t))) return false;
  return true;
}

export function getTestIdAttribute(el: Element): [string, string] | null {
  for (const attr of TEST_ID_ATTRIBUTES) {
    const v = el.getAttribute(attr);
    if (v && v.trim()) return [attr, v.trim()];
  }
  return null;
}

export function getTestId(el: Element): string | null {
  return getTestIdAttribute(el)?.[1] ?? null;
}

export function getStableClass(el: Element): string | null {
  const cls = el.getAttribute('class');
  if (!cls) return null;
  const parts = cls.trim().split(/\s+/).filter(isStableClass);
  if (parts.length === 0) return null;
  return parts[0];
}

const GENERIC_DATA_VALUE_UNSTABLE = /^[0-9a-f]{16,}$/i;

export function getGenericDataAttribute(el: Element): [string, string] | null {
  for (const attr of el.attributes) {
    if (!attr.name.startsWith('data-')) continue;
    if (TEST_ID_ATTRIBUTES.includes(attr.name)) continue;
    const v = attr.value.trim();
    if (v.length < 2 || v.length > 64) continue;
    if (GENERIC_DATA_VALUE_UNSTABLE.test(v)) continue;
    return [attr.name, v];
  }
  return null;
}

const ARIA_ATTRIBUTES = ['aria-label', 'aria-labelledby', 'aria-describedby'];

export function getAriaAttribute(el: Element): [string, string] | null {
  for (const attr of ARIA_ATTRIBUTES) {
    const v = el.getAttribute(attr);
    if (v && v.trim()) return [attr, v.trim()];
  }
  return null;
}
