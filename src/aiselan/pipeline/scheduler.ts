// pipeline/scheduler.ts — 艾瑟兰战役回合调度：AI回复 → 数据AI → 契约校验 → 结算 → 快照/标记
//
// 与渐变带调度相互独立：本调度只在 chat 变量 `艾瑟兰` 存档存在时才动作（未开局则完全静默）。
import { eventOn, getChatMessages, setChatMessages, getLastMessageId, updateVariablesWith } from '../../bridge/tavern';
import { loadSettings, STATUS_MARKER } from '../core/settings';
import { loadGame, saveGame, syncSnapshot } from '../core/store';
import { runDataAI } from './data-ai';
import { settle } from './settle';
import { 清空动作 } from '../engine/engine';

const SYNCABLE_TYPES = ['normal', 'regenerate', 'continue', 'swipe'];
let unsub: { stop: () => void } | null = null;
let busy = false;
let aiReplyCount = 0;

export interface 回合报告 { log: string[]; 丢弃: string[]; error?: string }

let lastReport: 回合报告 | null = null;
export function getLastReport(): 回合报告 | null { return lastReport; }

async function appendStatusMarker(floorId: number): Promise<void> {
  const msgs = getChatMessages(floorId);
  const msg = msgs?.[0];
  if (!msg || msg.is_user) return;
  if ((msg.message || '').endsWith(STATUS_MARKER)) return;
  await setChatMessages([{ message_id: floorId, message: msg.message + '\n' + STATUS_MARKER }], { refresh: 'affected' });
}

async function runTurn(): Promise<回合报告> {
  const report: 回合报告 = { log: [], 丢弃: [] };
  const settings = loadSettings();
  let g = loadGame();
  if (!g) { report.error = '未初始化存档（先在战役页初始化开局）'; return report; }

  // 每轮清空动作（状态栏操作流水不跨轮；清空后的存档随本回合一起落盘）
  const 清后 = 清空动作(g);
  if (清后 !== g) { g = 清后; report.log.push('（已清空上一轮的动作流水）'); }

  if (settings.开关.自动结算) {
    const res = await runDataAI(g);
    if (!res.ok) {
      report.error = res.error;
      report.log.push('数据AI/契约校验拒绝：' + res.error);
      report.log.push('（整包打回。可调整提示词后重试，或手动在战役页结算）');
    } else if (res.pack) {
      const r = settle(g, res.pack);
      report.log.push(...r.日志);
      report.丢弃.push(...r.丢弃);
      await saveGame(r.g);
      await syncSnapshot(r.g);
    }
  } else {
    report.log.push('（自动结算已关闭）');
  }

  // 结算日志落盘（战役页/状态栏读取）
  await updateVariablesWith(v => {
    v['艾瑟兰日志'] = { log: report.log, 丢弃: report.丢弃, error: report.error ?? null, 时间: new Date().toLocaleString() };
    return v;
  }, { type: 'chat' });
  lastReport = report;
  return report;
}

export function startScheduler(): void {
  if (unsub) return;
  unsub = eventOn('message_received', (messageId: number, type: string) => {
    if (!SYNCABLE_TYPES.includes(type)) return;
    if (typeof messageId !== 'number' || messageId < 0) return;
    void (async () => {
      if (busy) return;
      // 未开局（无存档）→ 完全静默，不抢渐变带/开局框架的活
      if (!loadGame()) return;
      const settings = loadSettings();
      const n = Math.max(1, Math.round(settings.频率.数据AI || 1));
      aiReplyCount++;
      const 该跑 = aiReplyCount % n === 0 || aiReplyCount === 1;
      if (!该跑) {
        if (settings.开关.状态栏标记) await appendStatusMarker(messageId);
        return;
      }
      busy = true;
      try {
        console.info('[艾瑟兰] 开始回合结算…');
        await runTurn();
      } catch (e) {
        console.error('[艾瑟兰] 回合结算异常', e);
      } finally {
        if (settings.开关.状态栏标记) await appendStatusMarker(getLastMessageId());
        busy = false;
      }
    })();
  });
  console.info('[艾瑟兰] 回合调度已启动');
}

export function stopScheduler(): void { unsub?.stop(); unsub = null; }

/** 手动触发一次结算（战役页按钮） */
export async function manualTurn(): Promise<回合报告> {
  if (busy) return { log: [], 丢弃: [], error: '上一轮结算尚未完成' };
  busy = true;
  try { return await runTurn(); } finally { busy = false; }
}

/** 重置节流计数（换聊天时调用） */
export function resetReplyCount(): void { aiReplyCount = 0; }
