// ui/app.ts — 面板壳：顶部模式切换 + 侧栏导航 + 页面分发（原生 DOM，无 vue-router）
//
// 样式不在这里注入：dist/index.css 由 manifest 的 css 字段注入主页面（指南 1.2）。
// 挂载点 = 窗口内容区（window/window.ts 的 #of-content）。
// 模式：presets（剑与汽水）/ gradband（渐变带）——按模式过滤侧栏，避免标签太多太乱。
import { renderStartPage } from './pages/start';
import { renderPresetPage } from './pages/preset-opening';
import { renderJianbandaiPage } from './pages/jianbandai-opening';
import { renderGradbandPage } from './pages/gradband';
import { renderGradbandPromptsPage } from './pages/gradband-prompts';
import { renderGradbandDataPage } from './pages/gradband-data';
import { renderAiselanPage } from './pages/aiselan';
import { renderAiselanPromptsPage } from './pages/aiselan-prompts';
import { renderChatPage } from './pages/chat';
import { renderTablesPage } from './pages/tables';
import { renderSheetConfigPage } from './pages/sheet-config';
import { renderPromptTemplatePage } from './pages/prompt-template';
import { renderSettingsPage } from './pages/settings';
import { renderApiPage } from './pages/api';
import { renderToolsPage } from './pages/tools';
import { loadSettings, saveSetting } from '../core/settings';

export type AppMode = 'presets' | 'gradband' | 'aiselan';

export interface PageDef {
  name: string;
  label: string;
  order: number;
  render: (el: HTMLElement) => void;
  /** 可见模式（缺省 = 两种模式都显示） */
  modes?: AppMode[];
}

export const PAGES: PageDef[] = [
  // ── 剑与汽水模式 ──
  { name: 'preset', label: '剑与汽水角色卡专用', order: 3, render: renderPresetPage, modes: ['presets'] },
  { name: 'start', label: '开局', order: 5, render: renderStartPage, modes: ['presets'] },
  { name: 'chat', label: 'AI 对话', order: 10, render: renderChatPage, modes: ['presets'] },
  { name: 'tables', label: '表格数据', order: 20, render: renderTablesPage, modes: ['presets'] },
  { name: 'sheetconf', label: '表结构/配置', order: 30, render: renderSheetConfigPage, modes: ['presets'] },
  { name: 'api', label: 'API', order: 35, render: renderApiPage, modes: ['presets'] },
  { name: 'settings', label: '设置', order: 40, render: renderSettingsPage, modes: ['presets'] },
  { name: 'prompt', label: '提示词模板', order: 50, render: renderPromptTemplatePage, modes: ['presets'] },
  { name: 'tools', label: '工具', order: 90, render: renderToolsPage, modes: ['presets'] },

  // ── 渐变带模式 ──
  { name: 'gradband', label: '渐变带·自由回路', order: 6, render: renderGradbandPage, modes: ['gradband'] },
  { name: 'gradband-prompts', label: '渐变带·提示词', order: 7, render: renderGradbandPromptsPage, modes: ['gradband'] },
  { name: 'gradband-data', label: '渐变带·数据', order: 8, render: renderGradbandDataPage, modes: ['gradband'] },
  { name: 'tables', label: '表格数据', order: 20, render: renderTablesPage, modes: ['gradband'] },
  { name: 'sheetconf', label: '表结构/配置', order: 30, render: renderSheetConfigPage, modes: ['gradband'] },
  { name: 'gradband-prompt', label: '提示词模板', order: 50, render: renderPromptTemplatePage, modes: ['gradband'] },
  { name: 'api', label: 'API', order: 35, render: renderApiPage, modes: ['gradband'] },
  { name: 'settings', label: '设置', order: 40, render: renderSettingsPage, modes: ['gradband'] },
  { name: 'tools', label: '工具', order: 90, render: renderToolsPage, modes: ['gradband'] },

  // ── 艾瑟兰战役模式 ──
  { name: 'aiselan', label: '艾瑟兰战役', order: 6, render: renderAiselanPage, modes: ['aiselan'] },
  { name: 'aiselan-prompts', label: '战役·提示词', order: 7, render: renderAiselanPromptsPage, modes: ['aiselan'] },
  { name: 'tables', label: '表格数据', order: 20, render: renderTablesPage, modes: ['aiselan'] },
  { name: 'sheetconf', label: '表结构/配置', order: 30, render: renderSheetConfigPage, modes: ['aiselan'] },
  { name: 'api', label: 'API', order: 35, render: renderApiPage, modes: ['aiselan'] },
  { name: 'settings', label: '设置', order: 40, render: renderSettingsPage, modes: ['aiselan'] },
  { name: 'tools', label: '工具', order: 90, render: renderToolsPage, modes: ['aiselan'] },
];

let currentName = 'start';
let contentEl: HTMLElement | null = null;
let navEl: HTMLElement | null = null;
let modeEl: HTMLElement | null = null;
let collapseState = false;

/**
 * 模式锁定（本仓库发行版）：非 null 时强制该模式——模式切换器只剩当前模式标签，其他模式隐藏且不可切换。
 * 代码里三条业务线仍并存（剑与汽水/渐变带/战役），需要放开时把这里改回 null 即可。
 */
const 锁定模式: AppMode | null = 'aiselan';

function currentMode(): AppMode {
  return 锁定模式 ?? (loadSettings().appMode ?? 'presets');
}

function visiblePages(): PageDef[] {
  const m = currentMode();
  return PAGES.filter(p => !p.modes || p.modes.includes(m));
}

/** 切页前清理旧页面登记的资源（如对话页的事件订阅） */
function disposeCurrentPage(): void {
  const dispose = (contentEl as any)?._ofDispose as (() => void) | undefined;
  if (typeof dispose === 'function') {
    try { dispose(); } catch (e) { console.warn('[开局框架面板] 页面清理失败', e); }
  }
}

export function mountApp(root: HTMLElement): void {
  root.className = 'of-panel';
  // 模式锁定后切换器只显示当前模式标签（不可点击）；未锁定时是三按钮切换器
  const 模式区 = 锁定模式
    ? `<div class="of-modepicker" id="of-modepicker"><span class="of-modebtn on" style="cursor:default">艾瑟兰战役</span></div>`
    : `<div class="of-modepicker" id="of-modepicker">
      <button class="of-modebtn" data-mode="presets">剑与汽水</button>
      <button class="of-modebtn" data-mode="gradband">渐变带</button>
      <button class="of-modebtn" data-mode="aiselan">战役</button>
    </div>`;
  root.innerHTML = `
    ${模式区}
    <nav class="of-nav" id="of-nav"></nav>
    <button class="of-collapse" id="of-collapse">◀</button>
    <div class="of-content" id="of-page"></div>
  `;

  const nav = root.querySelector('#of-nav') as HTMLElement;
  contentEl = root.querySelector('#of-page') as HTMLElement;
  navEl = nav;
  modeEl = root.querySelector('#of-modepicker') as HTMLElement;
  const collapseBtn = root.querySelector('#of-collapse') as HTMLElement;

  // 模式切换（锁定模式下切换器只有静态标签，点击直接忽略）
  function renderModePicker() {
    if (!modeEl) return;
    if (锁定模式) return;
    const m = currentMode();
    modeEl.querySelectorAll('.of-modebtn').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-mode') === m);
    });
  }
  modeEl.addEventListener('click', (e) => {
    if (锁定模式) return;
    const btn = (e.target as HTMLElement).closest('[data-mode]');
    if (!btn) return;
    const next = btn.getAttribute('data-mode') as AppMode;
    if (next === currentMode()) return;
    saveSetting('appMode', next);
    renderModePicker();
    renderNav();
    // 强制重渲染：当前页在新模式可见集 → 刷新；不在 → 回落到第一个可见页
    const pages = visiblePages();
    if (pages.some(p => p.name === currentName)) {
      refreshCurrent();
    } else {
      currentName = pages[0]?.name ?? 'start';
      switchTo(currentName);
    }
  });

  // 渲染侧栏
  function renderNav() {
    if (!navEl) return;
    navEl.innerHTML = visiblePages().map(p =>
      `<button class="of-nav-btn${p.name === currentName ? ' active' : ''}" data-page="${p.name}">${p.label}</button>`
    ).join('');
  }

  // 切页
  nav.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-page]');
    if (!btn) return;
    switchTo(btn.getAttribute('data-page')!);
  });

  collapseBtn.addEventListener('click', () => {
    collapseState = !collapseState;
    nav.style.display = collapseState ? 'none' : '';
    collapseBtn.textContent = collapseState ? '▶' : '◀';
  });

  // 锁定模式：把 appMode 也写成锁定值，保证将来放开锁定时默认仍是战役
  if (锁定模式 && loadSettings().appMode !== 锁定模式) {
    try { saveSetting('appMode', 锁定模式); } catch { /* 忽略 */ }
  }

  renderModePicker();
  renderNav();
  switchTo(currentName);
}

export function switchTo(name: string): void {
  const def = visiblePages().find(p => p.name === name);
  const target = def ?? visiblePages()[0] ?? PAGES[0];
  if (!target || !contentEl) return;
  currentName = target.name;
  // 更新侧栏高亮（nav 在面板根下，不在 content 内）
  navEl?.querySelectorAll('.of-nav-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-page') === currentName);
  });
  // 渲染页面（先清理旧页面资源）
  disposeCurrentPage();
  contentEl.innerHTML = '';
  try {
    target.render(contentEl);
  } catch (e) {
    contentEl.innerHTML = `<div style="padding:16px;color:#f38ba8">页面渲染失败: ${(e as Error).message}</div>`;
    console.error(`[开局框架面板] 页面 ${target.name} 渲染失败`, e);
  }
}

/** 面板内刷新当前页（外部状态变化后调用） */
export function refreshCurrent(): void {
  if (!contentEl) return;
  disposeCurrentPage();
  contentEl.innerHTML = '';
  const def = visiblePages().find(p => p.name === currentName);
  if (def) {
    try { def.render(contentEl); } catch (e) { console.error(e); }
  }
}
