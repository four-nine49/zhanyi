// aiselan/index.ts — 艾瑟兰战役 业务中枢（第3模式，挂进同一扩展面板）
//
// 职责：启动/停止回合调度、快照同步、初始化/重置存档。
// 状态栏/开局面板 HTML 后续由 build 产出，玩家手动导入酒馆正则（同渐变带流程）。
import { loadSettings } from './core/settings';
import { startScheduler, stopScheduler, manualTurn, getLastReport } from './pipeline/scheduler';
import { ensureGame, loadGame, saveGame, syncSnapshot } from './core/store';
import { 开局存档, GameSchema } from './core/schema';
import { setChatMessages, getChatMessages, getLastMessageId } from '../bridge/tavern';

/** 开局标记：由 json/regex-艾瑟兰开局.json 正则替换为开局面板 HTML */
export const OPENING_MARKER = '<艾瑟兰开局/>';

let started = false;

/** 初始化：启动调度（未开局时调度静默；开局后自动接管） */
export async function initAiselan(): Promise<void> {
  if (started) return;
  started = true;
  loadSettings();
  startScheduler();
  console.info('[艾瑟兰战役] 已随扩展启动（⚔ 在「战役」页操作）');
}

/** 销毁：停止调度 */
export function destroyAiselan(): void {
  stopScheduler();
  started = false;
}

/** 初始化开局存档（战役页「初始化开局」按钮） */
export async function initNewGame(): Promise<boolean> {
  await saveGame(GameSchema.parse(开局存档));
  await syncSnapshot(loadGame() ?? undefined);
  return true;
}

/** 重置存档（清空回到开局值） */
export async function resetGame(): Promise<boolean> {
  return initNewGame();
}

/** 把开局面板标记注入最新楼（战役页按钮；玩家导入 json/regex-艾瑟兰开局.json 后即显示面板） */
export async function injectOpeningToLatest(): Promise<boolean> {
  const id = getLastMessageId();
  if (id < 0) return false;
  const msgs = getChatMessages(id);
  const msg = msgs?.[0];
  if (!msg) return false;
  if ((msg.message || '').includes(OPENING_MARKER)) return true;
  await setChatMessages([{ message_id: id, message: (msg.message || '') + '\n' + OPENING_MARKER }], { refresh: 'affected' });
  return true;
}

export const aiselanApi = {
  start: () => startScheduler(),
  stop: () => stopScheduler(),
  manualTurn,
  getLastReport,
  initNewGame,
  resetGame,
  injectOpeningToLatest,
  syncSnapshot: () => syncSnapshot(loadGame() ?? undefined),
};
