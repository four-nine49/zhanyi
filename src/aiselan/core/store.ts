// core/store.ts — 艾瑟兰战役 chat 变量存储（唯一真值源）+ message 快照同步
//
// 存档：chat 变量 `艾瑟兰` 键 = 整个游戏对象
// 快照：message 变量 stat_data.艾瑟兰 = 剥掉 时刻.累计分钟 的同一对象
//       （状态栏/面板 HTML 与世界书 EJS 只读快照，永不直接读写 chat 变量）
import { getVariables, updateVariablesWith, getLastMessageId } from '../../bridge/tavern';
import { GameSchema, 开局存档, type Game } from './schema';

export const NS = '艾瑟兰';

export function loadGame(): Game | null {
  try {
    const raw = getVariables({ type: 'chat' })?.[NS];
    if (!raw) return null;
    const parsed = GameSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    console.warn('[艾瑟兰] 存档校验失败，忽略坏数据', parsed.error?.issues?.slice(0, 3));
    return null;
  } catch { return null; }
}

export async function saveGame(game: Game): Promise<boolean> {
  const clean = GameSchema.parse(game);   // 校验+剥 proxy
  await updateVariablesWith(v => { v[NS] = clean; return v; }, { type: 'chat' });
  return true;
}

export async function ensureGame(): Promise<Game> {
  let g = loadGame();
  if (!g) { g = GameSchema.parse(开局存档); await saveGame(g); }
  return g;
}

/** 读写一条龙：读取 → 内存副本上改 → 落盘（事务性，改完即存） */
export async function mutateGame<T>(fn: (g: Game) => T | Promise<T>): Promise<T | null> {
  const g = loadGame();
  if (!g) return null;
  const result = await fn(g);
  await saveGame(g);
  return result;
}

/** 快照同步到最新楼 stat_data.艾瑟兰（剥 时刻.累计分钟） */
export async function syncSnapshot(game?: Game): Promise<boolean> {
  const g = game ?? loadGame();
  if (!g) return false;
  const snap = GameSchema.parse(g);       // 深拷贝+校验
  (snap.时刻 as any).累计分钟 = undefined; // AI 永不可见内部账本
  const mid = getLastMessageId();
  if (mid < 0) return false;
  await updateVariablesWith(v => {
    v.stat_data ??= {};
    v.stat_data[NS] = snap;
    return v;
  }, { type: 'message', message_id: mid });
  return true;
}
