// index.ts — 开局框架扩展入口（指南 二）
//
// 运行环境：酒馆主页面（manifest.json 声明 dist/index.js + dist/index.css，由酒馆注入）。
// 入口只负责生命周期。保底原则：🎬 悬浮球最先挂载——后续任何一步失败都不影响它的存在；
// 初始化完成后 3 秒自检一次，球被意外移除则补挂；整体初始化失败自动重试一次。
// 业务逻辑在 store / fill / schedule / chat / dialogue / ui 各模块。
import { initWindow, destroyWindow, toggleWindowVisibility } from './window/window';
import { createToggle, destroyToggle } from './window/toggle';
import { VERSION } from './core/version';
import { EventManager } from './core/event-manager';
import { registerSlashCommands, unregisterSlashCommands } from './core/slash';
import { eventOn, tavern_events, bridgeAvailable } from './bridge/tavern';
import { startAutoFill, stopAutoFill, resetFloorCount } from './schedule/trigger';
import { initAutoSyncIfEnabled } from './sync/message-sync';
import { initStatusPlaceholderIfEnabled } from './sync/status-placeholder';
import { loadSettings as loadBusinessSettings } from './store/settings';
import { mountApp, refreshCurrent, 锁定模式 } from './ui/app';
import { initGradband, destroyGradband } from './gradband/index';
import { initAiselan, destroyAiselan } from './aiselan/index';

const INSTANCE_KEY = '__OPENING_FRAMEWORK_INSTANCE__';
const TOGGLE_ID = 'of-toggle';

let isInitialized = false;
let isDestroying = false;
let autoRetryUsed = false; // 初始化失败只自动重试一次，防止无限循环
const eventManager = new EventManager();

/** 悬浮球点击：开关主界面 */
function toggleMainPanel(): void {
  const shown = toggleWindowVisibility();
  if (shown) refreshCurrent(); // 打开时刷新当前页数据
}

// ── 初始化 ──
async function doInitialize(): Promise<void> {
  // 0. 保底入口：悬浮球最先挂——后面任何一步失败都不影响它
  createToggle({ onToggle: toggleMainPanel });

  // 1. 环境检查（TavernHelper 提供变量/生成 API；缺失则只提示，UI 仍可用）
  if (!bridgeAvailable()) {
    console.error('[开局框架] TavernHelper API 不可用（需先安装并启用酒馆助手/TavernHelper），变量与生成功能将不可用');
    toastr?.error?.('开局框架：TavernHelper 不可用，请确认已启用酒馆助手插件');
  }

  // 2. 挂载窗口 + 面板
  const win = initWindow();
  const contentEl = win.querySelector('#of-content') as HTMLElement;
  mountApp(contentEl);

  // 3. 注册 Slash 命令（失败不影响其他功能）
  void registerSlashCommands();

  // 4. 注册事件监听（统一登记，destroy 时清理）
  eventManager.addDisposer(eventOn(tavern_events.CHAT_CHANGED, () => {
    resetFloorCount(); // 楼层计数是内存态；对话状态存 chat 变量，天然按聊天隔离
  }).stop);

  // 6. 启动自动填表 / 自动数据同步 / 状态栏标记 / 渐变带 + 艾瑟兰战役业务（按设置；各自由存档存在与否静默把关）
  //    锁定战役模式时，标准表格那一套（填表/开局框架同步/状态栏标记）在战役里用不到，不启动——
  //    避免无用的后台监听，也避免它与战役自己的 <StatusPlaceHolderImpl/> 标记出现「同标记两来源」。
  const settings = loadBusinessSettings();
  if (锁定模式 !== 'aiselan') {
    if (settings.autoFillEnabled) startAutoFill();
    initAutoSyncIfEnabled();
    initStatusPlaceholderIfEnabled();
  }
  void initGradband();
  void initAiselan();

  const inst = (window as any)[INSTANCE_KEY];
  if (inst) inst.status = 'ready';

  // 6. 保底自检：3 秒后确认悬浮球仍在（被意外移除/其它脚本误删则补挂）
  setTimeout(() => {
    if (isDestroying) return;
    if (!document.getElementById(TOGGLE_ID)) {
      console.warn('[开局框架] 未检测到悬浮球，已补挂');
      createToggle({ onToggle: toggleMainPanel });
    }
  }, 3000);

  console.info(`[开局框架] v${VERSION} 初始化完成（悬浮球 / /opening 打开窗口）`);
}

function ensureInitialized(): void {
  if (isInitialized || isDestroying) return;
  isInitialized = true;
  doInitialize().catch((e) => {
    console.error('[开局框架] 初始化失败：', e);
    isInitialized = false;
    // 保底：即使初始化失败，悬浮球也要在（重挂一次）
    try {
      if (!document.getElementById(TOGGLE_ID)) createToggle({ onToggle: toggleMainPanel });
    } catch { /* 忽略 */ }
    // 自动重试一次（如酒馆助手晚于本扩展就绪的场景）
    if (!autoRetryUsed) {
      autoRetryUsed = true;
      setTimeout(() => ensureInitialized(), 2000);
    }
    toastr?.error?.('开局框架初始化失败：' + (e as Error).message);
  });
}

// ── 销毁 ──
function destroy(): void {
  if (isDestroying) return;
  isDestroying = true;

  // 1. 注销 Slash 命令
  unregisterSlashCommands();

  // 2. 停止自动填表 + 渐变带/艾瑟兰业务 + 清理事件监听器
  stopAutoFill();
  destroyGradband();
  destroyAiselan();
  eventManager.dispose();

  // 3. 移除 DOM（根容器含窗口 + 悬浮按钮）
  destroyWindow();
  destroyToggle();

  // 4. 释放 singleton
  delete (window as any)[INSTANCE_KEY];

  isDestroying = false;
  isInitialized = false;
}

// ── 启动 ──
(function init() {
  const host = window as any;
  if (host[INSTANCE_KEY]) {
    console.warn('[开局框架] 已存在活跃实例，跳过重复初始化');
    return;
  }
  host[INSTANCE_KEY] = { version: VERSION, source: 'extension', status: 'initializing', destroy };

  const onReady = () => { try { ensureInitialized(); } catch (e) { console.error('[开局框架] 启动异常：', e); } };
  // 扩展由酒馆注入，readyState 可能已是 interactive/complete，此时 setTimeout 兜底执行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    setTimeout(onReady, 100);
  }
})();

// 调试句柄：控制台可 __OPENING_FRAMEWORK_INSTANCE__.destroy() 触发完整销毁
