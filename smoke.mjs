// smoke.mjs — Node 冒烟测试：最小 DOM shim 下跑通 bundle 初始化 + 销毁全链路
// （环境无 SillyTavern；目标是验证模块接线、初始化流程与 destroy 无崩溃）

const byId = new Map();

function makeEl(id) {
  const el = {
    id,
    style: {},
    hidden: false,
    className: '',
    innerHTML: '',
    textContent: '',
    childElementCount: 0,
    offsetWidth: 420,
    offsetHeight: 660,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) { if (force === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (force) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    appendChild(child) { if (child && child.id) byId.set(child.id, child); el.childElementCount++; return child; },
    remove() { byId.delete(el.id); },
    querySelector(sel) { const el = makeEl(); if (sel === '#of-content') byId.set('of-content', el); return el; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 10, top: 10, width: 420, height: 660 }; },
    scrollTop: 0, scrollHeight: 0,
  };
  return el;
}

globalThis.module = undefined; // 让 UMD engine 走 elsewhere 分支挂 window/globalThis（浏览器默认如此）

globalThis.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  readyState: 'complete',
  body: makeEl('body'),
  head: makeEl('head'),
  createElement: () => makeEl(),
  getElementById: (id) => byId.get(id) ?? null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
};
globalThis.toastr = { error() {}, info() {}, success() {}, warning() {} };

const log = (...a) => console.log('[smoke]', ...a);

try {
  await import('./dist/index.js');
} catch (e) {
  console.error('[smoke] bundle 顶层执行崩溃：', e);
  process.exit(1);
}

// readyState=complete → setTimeout(onReady, 100) 兜底；给足异步时间（含 slash 动态 import 失败路径）
setTimeout(() => {
  const inst = globalThis.window.__OPENING_FRAMEWORK_INSTANCE__;
  if (!inst) { console.error('[smoke] FAIL: singleton 未注册'); process.exit(1); }
  log('singleton:', { version: inst.version, status: inst.status });
  if (inst.status !== 'ready') { console.error('[smoke] FAIL: 状态未到 ready'); process.exit(1); }
  for (const id of ['of-root', 'of-window', 'of-toggle']) {
    if (!byId.has(id)) { console.error('[smoke] FAIL: DOM 缺失', id); process.exit(1); }
  }
  log('DOM 挂载齐全: of-root / of-window / of-toggle');

  // 面板锁定校验：切换器只剩静态「艾瑟兰战役」标签，不得渲染其它模式切换按钮
  const panelHtml = byId.get('of-content')?.innerHTML || '';
  if (!panelHtml.includes('艾瑟兰战役')) { console.error('[smoke] FAIL: 面板未渲染战役模式标签'); process.exit(1); }
  if (panelHtml.includes('data-mode="presets"') || panelHtml.includes('data-mode="gradband"')) {
    console.error('[smoke] FAIL: 锁定模式下仍渲染了其它模式切换按钮'); process.exit(1);
  }
  log('面板已锁定战役模式（切换器只剩静态标签）');

  // 完整销毁
  try {
    inst.destroy();
  } catch (e) {
    console.error('[smoke] FAIL: destroy 崩溃', e);
    process.exit(1);
  }
  if (globalThis.window.__OPENING_FRAMEWORK_INSTANCE__) { console.error('[smoke] FAIL: singleton 未释放'); process.exit(1); }
  if (byId.has('of-window') || byId.has('of-toggle')) { console.error('[smoke] FAIL: DOM 未清理'); process.exit(1); }
  log('destroy 完整：singleton 已释放、DOM 已清理');
  console.log('SMOKE OK');
  process.exit(0);
}, 1500);
