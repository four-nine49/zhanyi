// window/window.ts — 扩展窗口（指南 三）
//
// 窗口 = position:fixed 浮层容器，可拖拽（标题栏 Pointer Events）、可缩放（data-dir 手柄）、可开关。
// 位置/尺寸持久化到 extensionSettings（core/settings），初始位置经 constrainPosition 约束。
import { constrainPosition, clamp } from '../core/geometry';
import { loadSettings, saveSetting } from '../core/settings';

export const DOM_IDS = {
  root: 'of-root',            // 全局根容器（放窗口 + 悬浮按钮）
  window: 'of-window',        // 窗口本体
  content: 'of-content',      // 窗口内容区（面板挂载点）
  titlebar: 'of-titlebar',
} as const;

const MIN_W = 320;
const MIN_H = 420;
const DEFAULT_W = 420;
const DEFAULT_H = 660;

// ──────────────────────────────────────────────
// 根容器
// ──────────────────────────────────────────────

export function createRoot(): HTMLElement {
  let root = document.getElementById(DOM_IDS.root);
  if (root) return root;

  root = document.createElement('div');
  root.id = DOM_IDS.root;
  root.className = 'of-root';
  document.body.appendChild(root);
  return root;
}

// ──────────────────────────────────────────────
// 窗口容器
// ──────────────────────────────────────────────

export function createWindow(): HTMLElement {
  let win = document.getElementById(DOM_IDS.window);
  if (win) return win;

  const root = createRoot();
  win = document.createElement('div');
  win.id = DOM_IDS.window;
  win.className = 'of-window';

  // 从设置读取上次的位置和尺寸；手机/窄屏（≤640px）忽略存档直接近全屏
  const settings = loadSettings();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isSmall = vw <= 640;
  const width = clamp(isSmall ? vw - 8 : settings.windowWidth, MIN_W, vw);
  const height = clamp(isSmall ? vh - 8 : settings.windowHeight, MIN_H, vh);
  const x = isSmall ? 4 : (settings.windowX ?? Math.max(10, vw - width - 40));
  const y = isSmall ? 4 : (settings.windowY ?? Math.max(60, Math.floor((vh - height) / 2)));

  const pos = constrainPosition(x, y, width, height);
  win.style.left = pos.x + 'px';
  win.style.top = pos.y + 'px';
  win.style.width = width + 'px';
  win.style.height = height + 'px';

  // 窗口内容（标题栏 + 内容区 + 缩放手柄）
  win.innerHTML = `
    <div class="of-window-titlebar" id="${DOM_IDS.titlebar}">
      <span class="of-window-title">⚔ 艾瑟兰战役</span>
      <button class="of-window-close" id="of-window-close" title="关闭">✕</button>
    </div>
    <div class="of-window-content" id="${DOM_IDS.content}"></div>
    <div class="of-window-resize" data-dir="e" title="左右拉伸"></div>
    <div class="of-window-resize" data-dir="s" title="上下拉伸"></div>
    <div class="of-window-resize" data-dir="se" title="斜角拉伸"></div>
  `;

  // 关闭按钮：只关窗口，不触发标题栏拖拽
  win.querySelector('#of-window-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWindowVisibility(false);
  });

  root.appendChild(win);
  return win as HTMLElement;
}

// ──────────────────────────────────────────────
// 窗口拖拽（指南 3.2：Pointer Events 统一鼠标/触摸）
// ──────────────────────────────────────────────

export function initWindowDrag(): void {
  const win = document.getElementById(DOM_IDS.window);
  const titlebar = win?.querySelector<HTMLElement>('#' + DOM_IDS.titlebar);
  if (!win || !titlebar) return;

  let isDragging = false;
  let offsetX = 0, offsetY = 0, pointerId: number | null = null;

  titlebar.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.of-window-close')) return;      // 点关闭按钮不拖拽
    if (win.classList.contains('resizing')) return;
    isDragging = true;
    pointerId = e.pointerId;

    const rect = win.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    win.classList.add('dragging');
    e.preventDefault();
  });

  titlebar.addEventListener('pointermove', (e) => {
    if (!isDragging || e.pointerId !== pointerId) return;

    const pos = constrainPosition(
      e.clientX - offsetX,
      e.clientY - offsetY,
      win.offsetWidth,
      win.offsetHeight,
    );
    win.style.left = pos.x + 'px';
    win.style.top = pos.y + 'px';
    e.preventDefault();
  });

  const onUp = (e: PointerEvent) => {
    if (!isDragging || e.pointerId !== pointerId) return;
    isDragging = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
    win.classList.remove('dragging');

    // 拖拽结束持久化位置
    saveSetting('windowX', parseInt(win.style.left, 10));
    saveSetting('windowY', parseInt(win.style.top, 10));
    pointerId = null;
  };

  titlebar.addEventListener('pointerup', onUp);
  titlebar.addEventListener('pointercancel', onUp);
  titlebar.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ──────────────────────────────────────────────
// 窗口缩放（指南 3.3：data-dir 手柄，e=右 s=下 se=右下）
// ──────────────────────────────────────────────

export function initWindowResize(): void {
  const win = document.getElementById(DOM_IDS.window);
  if (!win) return;

  win.querySelectorAll<HTMLElement>('.of-window-resize').forEach((handle) => {
    let isResizing = false;
    let pointerId: number | null = null;
    let dir = '';
    let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dir = handle.getAttribute('data-dir') || '';

      const rect = win.getBoundingClientRect();
      isResizing = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = rect.width;
      startHeight = rect.height;

      handle.setPointerCapture(e.pointerId);
      win.classList.add('resizing');
    });

    handle.addEventListener('pointermove', (e) => {
      if (!isResizing || e.pointerId !== pointerId) return;
      e.preventDefault();

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let nextWidth = startWidth;
      let nextHeight = startHeight;
      if (dir.includes('e')) nextWidth = clamp(startWidth + deltaX, MIN_W, window.innerWidth);
      if (dir.includes('s')) nextHeight = clamp(startHeight + deltaY, MIN_H, window.innerHeight);

      win.style.width = Math.round(nextWidth) + 'px';
      win.style.height = Math.round(nextHeight) + 'px';
    });

    const onUp = (e: PointerEvent) => {
      if (!isResizing || e.pointerId !== pointerId) return;
      isResizing = false;
      try { handle.releasePointerCapture(e.pointerId); } catch { /* 忽略 */ }
      win.classList.remove('resizing');

      // 缩放结束持久化尺寸 + 位置（缩放后可能超出视口，需重新约束）
      const pos = constrainPosition(
        parseInt(win.style.left, 10) || 0,
        parseInt(win.style.top, 10) || 0,
        win.offsetWidth,
        win.offsetHeight,
      );
      win.style.left = pos.x + 'px';
      win.style.top = pos.y + 'px';

      saveSetting('windowX', pos.x);
      saveSetting('windowY', pos.y);
      saveSetting('windowWidth', win.offsetWidth);
      saveSetting('windowHeight', win.offsetHeight);
      pointerId = null;
      dir = '';
    };

    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
    handle.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

// ──────────────────────────────────────────────
// 窗口开关（指南 3.5）
// ──────────────────────────────────────────────

export function toggleWindowVisibility(show?: boolean): boolean {
  const win = document.getElementById(DOM_IDS.window);
  if (!win) return false;

  const nextShow = show ?? !win.classList.contains('visible');
  win.classList.toggle('visible', nextShow);
  return nextShow;
}

export function isWindowVisible(): boolean {
  const win = document.getElementById(DOM_IDS.window);
  return !!win && win.classList.contains('visible');
}

// ──────────────────────────────────────────────
// 初始化 / 销毁
// ──────────────────────────────────────────────

let viewportResizeBound = false;

/** 创建窗口（含拖拽/缩放绑定）；面板内容由调用方挂到 #of-content */
export function initWindow(): HTMLElement {
  const win = createWindow();
  initWindowDrag();
  initWindowResize();
  // 转屏 / 浏览器缩放：把窗口拉回可视区（窄屏下样式已强制近全屏，这里兜底宽屏情形）
  if (!viewportResizeBound) {
    viewportResizeBound = true;
    window.addEventListener('resize', () => {
      const w = document.getElementById(DOM_IDS.window);
      if (!w) return;
      const pos = constrainPosition(
        parseInt(w.style.left, 10) || 0,
        parseInt(w.style.top, 10) || 0,
        w.offsetWidth,
        w.offsetHeight,
      );
      w.style.left = pos.x + 'px';
      w.style.top = pos.y + 'px';
    });
  }
  return win;
}

/** 移除根容器（窗口 + 悬浮按钮一并移除） */
export function destroyWindow(): void {
  document.getElementById(DOM_IDS.window)?.remove();
  const root = document.getElementById(DOM_IDS.root);
  if (root && root.childElementCount === 0) root.remove();
}
