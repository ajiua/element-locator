// src/content/panel.ts
// 注入右下角浮动面板（shadow DOM 隔离样式），渲染结果并提供一键复制。

import cssText from '../styles/panel.css';
import { esc, starsFor, statusText } from './panel-format';
import type { AncestorItem, Candidate, FrameInfo, LocatorResult, PanelPicker } from './types';

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function candidateList(cands: Candidate[]): string {
  return cands
    .map((c) => {
      const st = c.validation ? statusText(c.validation) : '';
      const best = c.validation?.status === 'unique' && c.validation.matchesTarget ? ' ✓' : '';
      return `<li><code>${esc(c.selector)}</code> <span class="meta">${esc(c.reason)} · ${esc(st)}${best} · ${esc(starsFor(c.score))}</span></li>`;
    })
    .join('');
}

function crumbLabel(a: AncestorItem): string {
  const id = a.id ? `#${a.id}` : '';
  const cls = a.classes.length ? `.${a.classes.join('.')}` : '';
  return `${a.tag}${id}${cls}`;
}

function crumbsHtml(picker: PanelPicker): string {
  return `<div class="crumbs">${picker.ancestors
    .map(
      (a, i) =>
        `<button type="button" class="crumb${a.selected ? ' on' : ''}" data-crumb="${i}" title="${esc(crumbLabel(a))}">${esc(crumbLabel(a))}</button>`,
    )
    .join('<span class="crumb-sep">&gt;</span>')}</div>`;
}

// frame 受限提示：以 limitation 为准绳精确区分跨域与"可访问但无唯一候选"；
// 同源且无受限时保持既有展示，全部插值文本经 esc() 转义。
function frameNoteHtml(frame: FrameInfo): string {
  if (!frame.inFrame) return '';
  const urlPart = frame.url ? ` (<code>${esc(frame.url)}</code>)` : '';
  if (frame.limitation === 'unlocatable') {
    return `<div class="note warn">iframe 可访问，但没有唯一且命中目标的定位器</div>`;
  }
  if (frame.limitation === 'cross-origin' || !frame.sameOrigin) {
    return `<div class="note warn">跨域 iframe，无法生成完整定位路径${urlPart} — 请先切换到对应 frame</div>`;
  }
  return `<div class="note warn">Frame: <code>${esc(frame.path)}</code> — 需先进入该 iframe 再使用定位器${urlPart}</div>`;
}

function ensureHost(): void {
  if (host && host.isConnected) return;
  host = document.createElement('div');
  host.id = 'element-locator-host';
  host.style.cssText =
    'position:fixed;right:16px;bottom:16px;z-index:2147483647;font-family:system-ui,sans-serif;';
  shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);
}

export function showPanel(result: LocatorResult, picker?: PanelPicker): void {
  ensureHost();
  if (!shadow) return;

  const xpathBest = result.xpath.best;
  const cssBest = result.css.best;
  const xpathSel = xpathBest ? xpathBest.selector : '(未生成)';
  const cssSel = cssBest ? cssBest.selector : '(未生成)';
  const xpathStatus = xpathBest ? statusText(xpathBest.validation) : '✗ 无有效定位器';
  const cssStatus = cssBest ? statusText(cssBest.validation) : '✗ 无有效定位器';

  // Java 复制选项：勾选后把 " 转义为 \"（显示与复制同步），默认关闭。
  const javaState = { on: false, rawXpath: xpathSel, rawCss: cssSel };
  function escapeForJava(s: string): string {
    return s.replace(/"/g, '\\"');
  }
  function disp(s: string): string {
    return javaState.on ? escapeForJava(s) : s;
  }

  const frameHtml = frameNoteHtml(result.frame);
  const shadowHtml = result.shadow.inside
    ? `<div class="note warn">Target is inside Shadow DOM${result.shadow.closed ? ' (closed)' : ''}</div>`
    : '';
  const shadowDetail = result.shadow.hostXPath
    ? `<div class="note">host: <code>${esc(result.shadow.hostXPath)}</code>` +
      (result.shadow.innerXPath ? ` · inner: <code>${esc(result.shadow.innerXPath)}</code>` : '') +
      `</div>`
    : '';

  shadow.innerHTML = `
    <style>${cssText}</style>
    <div class="panel">
      <div class="head">
        <span class="title">Element Locator</span>
        <button class="close" data-act="close">×</button>
      </div>
      ${picker ? crumbsHtml(picker) : ''}
      ${frameHtml}
      ${shadowHtml}
      ${shadowDetail}
      <div class="target">Target: <code>&lt;${esc(result.target.tag)}&gt;</code> ${esc(result.target.text || '(无文本)')}</div>
      <div class="opt"><label><input type="checkbox" data-act="java-escape" /> Java：复制时把双引号转义为 \\"</label></div>
      ${picker ? `<div class="opt" data-opt="structural">
        <label><input type="checkbox" data-act="structural"${picker.structural ? ' checked' : ''} /> 结构化：不用文字，按结构/href 定位</label>
        <label class="depth"${picker.structural ? '' : ' hidden'}><input type="number" data-act="structural-depth" min="1" step="1" value="${picker.structuralDepth || ''}" placeholder="自动" /> 往上查找 N 个父级</label>
      </div>` : ''}
      <div class="section">
        <div class="label">XPath</div>
        <div class="selbox"><code data-sel="xpath">${esc(disp(xpathSel))}</code></div>
        <div class="status ${xpathBest ? 'ok' : 'bad'}">${esc(xpathStatus)} ${esc(starsFor(xpathBest ? xpathBest.score : 0))}</div>
        <button class="copy" data-act="copy" data-kind="xpath">复制 XPath</button>
      </div>
      <div class="section">
        <div class="label">CSS Selector</div>
        <div class="selbox"><code data-sel="css">${esc(disp(cssSel))}</code></div>
        <div class="status ${cssBest ? 'ok' : 'bad'}">${esc(cssStatus)} ${esc(starsFor(cssBest ? cssBest.score : 0))}</div>
        <button class="copy" data-act="copy" data-kind="css">复制 CSS</button>
      </div>
      <details class="more">
        <summary>其他候选 (${result.xpath.all.length + result.css.all.length})</summary>
        <h5>XPath</h5><ul>${candidateList(result.xpath.all)}</ul>
        <h5>CSS</h5><ul>${candidateList(result.css.all)}</ul>
      </details>
    </div>
  `;

  const codeBoxes = {
    xpath: shadow.querySelector('code[data-sel="xpath"]'),
    css: shadow.querySelector('code[data-sel="css"]'),
  };
  const escapeOpt = shadow.querySelector<HTMLInputElement>('input[data-act="java-escape"]');
  function refreshSelectors(): void {
    if (codeBoxes.xpath) codeBoxes.xpath.textContent = disp(javaState.rawXpath);
    if (codeBoxes.css) codeBoxes.css.textContent = disp(javaState.rawCss);
  }
  escapeOpt?.addEventListener('change', () => {
    javaState.on = escapeOpt.checked;
    refreshSelectors();
  });

  if (picker) {
    shadow.querySelectorAll<HTMLElement>('[data-crumb]').forEach((el) => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.crumb);
        if (Number.isInteger(i)) picker.onPick(i);
      });
    });
    const structuralOpt = shadow.querySelector<HTMLInputElement>('input[data-act="structural"]');
    const depthInput = shadow.querySelector<HTMLInputElement>('input[data-act="structural-depth"]');
    const depthLabel = shadow.querySelector<HTMLElement>('[data-opt="structural"] .depth');
    // 初始状态：非结构化时隐藏深度输入
    if (depthLabel && !picker.structural) depthLabel.hidden = true;
    const onStructural = (): void => {
      const on = structuralOpt?.checked ?? false;
      if (depthLabel) depthLabel.hidden = !on;
      const depth = on ? Math.max(0, Number(depthInput?.value) || 0) : 0;
      picker.onStructuralChange(on, depth);
    };
    structuralOpt?.addEventListener('change', onStructural);
    depthInput?.addEventListener('change', onStructural);
  }

  shadow.querySelector('.close')?.addEventListener('click', hidePanel);
  if (!escHandler) {
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hidePanel();
    };
    document.addEventListener('keydown', escHandler);
  }
  shadow.querySelectorAll<HTMLButtonElement>('[data-act="copy"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.kind;
      const sel = disp(kind === 'xpath' ? javaState.rawXpath : javaState.rawCss);
      void copyText(sel).then((ok) => {
        btn.textContent = ok ? 'Copied!' : '复制失败';
        const label = kind === 'xpath' ? '复制 XPath' : '复制 CSS';
        setTimeout(() => { btn.textContent = label; }, 2000);
      });
    });
  });
}

export function hidePanel(): void {
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  host?.remove();
  host = null;
  shadow = null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
