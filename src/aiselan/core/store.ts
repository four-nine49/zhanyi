// core/store.ts — 艾瑟兰战役 chat 变量存储（唯一真值源）+ message 快照同步
//
// 存档：chat 变量 `艾瑟兰` 键 = 整个游戏对象
// 快照：message 变量 stat_data.艾瑟兰 = 剥掉 时刻.累计分钟 的同一对象
//       （状态栏/面板 HTML 与世界书 EJS 只读快照，永不直接读写 chat 变量）
import { getVariables, updateVariablesWith, getLastMessageId } from '../../bridge/tavern';
import { GameSchema, 开局存档, type Game } from './schema';

export const NS = '艾瑟兰';

/** 迁移：老档（无物品编号 / 槽位存物品名）补齐为编号制 —— 不堆叠改动后的兼容层 */
export function 迁移物品编号(g: Game, 原始物品?: unknown): void {
  // ⓪ 旧档的「数量 N」按不堆叠规则展开成 N 条独立记录（原始数组与解析后数组顺序一致）
  if (Array.isArray(原始物品) && 原始物品.length === g.物品.length) {
    const 展开: typeof g.物品 = [];
    g.物品.forEach((解析项, i) => {
      const 原 = 原始物品[i] as { 数量?: unknown } | null;
      const n = 原 && typeof 原.数量 === 'number' ? Math.max(1, Math.floor(原.数量)) : 1;
      for (let k = 0; k < n; k++) 展开.push({ ...解析项, 编号: '' });
    });
    g.物品 = 展开;
  }
  // ① 给没有编号的物品发编号（数字字符串，从现有最大值往后排）
  let max = 0;
  for (const i of g.物品) {
    const n = parseInt(i.编号, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  for (const i of g.物品) {
    if (!i.编号) i.编号 = String(++max);
  }
  // ② 槽位若存的是「物品名」而不是编号 → 转成对应物品的编号
  const 转 = (持有者: string, 槽位: '武器' | '副手' | '护甲' | '饰品', 装备块: any) => {
    const v = 装备块?.[槽位];
    if (!v) return;
    const 已存在 = g.物品.some(i => i.编号 === v);
    if (已存在) return;
    const 片 = g.物品.find(i => i.名称 === v && i.持有者 === 持有者);
    if (片) 装备块[槽位] = 片.编号;
    else 装备块[槽位] = null;                    // 找不到对应物品 → 清空，避免脏引用
  };
  for (const 槽位 of ['武器', '副手', '护甲', '饰品'] as const) {
    转('主角', 槽位, g.主角.装备);
    转('爱丽丝', 槽位, g.生物.爱丽丝.装备);
  }
}

export function loadGame(): Game | null {
  try {
    const raw = getVariables({ type: 'chat' })?.[NS];
    if (!raw) return null;
    const parsed = GameSchema.safeParse(raw);
    if (parsed.success) { 迁移物品编号(parsed.data, (raw as any)?.物品); return parsed.data; }
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
