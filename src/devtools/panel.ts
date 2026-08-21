// src/devtools/panel.ts
// DevTools "Element Locator" 面板逻辑：通过 $0 取 Elements 中当前选中的元素，调用
// 页面主世界的 window.__elementLocatorGenerateAndShow(el) 生成并展示定位器浮层。

interface Outcome {
  ok: boolean;
  error?: string;
}

const btn = document.getElementById('generate') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

function setStatus(msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : '';
}

btn.addEventListener('click', () => {
  const iw = chrome.devtools?.inspectedWindow;
  if (!iw) {
    setStatus('DevTools API 不可用', true);
    return;
  }
  setStatus('生成中…');
  iw.eval(
    `(function(){
       if (typeof $0 === 'undefined' || $0 === null || (!$0 && $0.tagName === undefined))
         return { ok:false, error:'请先在「元素」面板选中一个元素' };
       if (typeof window.__elementLocatorGenerateAndShow !== 'function')
         return { ok:false, error:'页面尚未加载扩展脚本，请刷新页面后重试' };
       return window.__elementLocatorGenerateAndShow($0);
     })()`,
    (result, isException) => {
      const r = result as Outcome | undefined;
      if (isException || !r || r.ok !== true) {
        setStatus(r?.error ?? (isException ? '在页面中执行失败' : '未知错误'), true);
        return;
      }
      setStatus('已生成，定位浮层已显示在页面上');
    },
  );
});
