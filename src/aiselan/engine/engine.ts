// engine/engine.ts — 艾瑟兰战役纯函数核算引擎
//
// 铁律「数字只被脚本改」：AI/玩家不得自行算数，一切计算过本模块。
// 所有函数为纯函数：输入旧 Game + 参数，输出新 Game（不修改入参）。
// 规则来源：《变量设计.md》§四 与 《艾瑟兰设定集.md》「系统算力规则（第一卷）」。
import type { Game, 生物, 临时加成, 物品, 技能 } from '../core/schema';
import { 关系阶段 } from '../core/schema';

/* ═══════════════════════════════════════════════════════════════
   派生量（不存储，现算）
   ═══════════════════════════════════════════════════════════════ */

/** 算力上限 = 20 × 基础智力（临时加成的智力不计入） */
export function 算力上限(g: Game): number {
  return 20 * g.主角.属性.智力;
}

/** 生效属性 = 基础值 + 同属性临时加成求和 */
export function 生效属性(g: Game, 属性名: '力量' | '敏捷' | '体质' | '智力', 目标?: 生物): number {
  const 基础 = 目标 ? 目标.属性[属性名] : g.主角.属性[属性名];
  const 加成列表 = 目标 ? 目标.临时加成 : g.主角.临时加成;
  const 加成和 = 加成列表.filter(b => b.属性 === 属性名).reduce((s, b) => s + b.值, 0);
  return 基础 + 加成和;
}

/** 世界状态：累计消耗 <100 微澜 / ≥100 异象 / ≥250 裂隙 */
export function 世界状态(g: Game): '微澜' | '异象' | '裂隙' {
  const c = g.算力.累计消耗;
  if (c >= 250) return '裂隙';
  if (c >= 100) return '异象';
  return '微澜';
}

/** 陷落度阶段名（0-6 格 → 静态表，纯展示） */
export function 陷落度阶段名(格: number): string {
  const 表 = [
    '风暴眼', '混乱期', '混乱期', '沦陷期·水源带毒',
    '沦陷期·焚城', '收束期·幼体降临', '终局·火炮洗地',
  ];
  return 表[Math.min(Math.max(格, 0), 6)];
}

/* ═══════════════════════════════════════════════════════════════
   时间结算（每回合最先执行）
   ═══════════════════════════════════════════════════════════════ */

/** 解析 "1042年11月29日 14:20" → 分钟数（自纪元起） */
export function 时刻转分钟(时刻: string): number | null {
  const m = 时刻.match(/^(\d+)年(\d+)月(\d+)日\s+(\d+):(\d+)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  // 格里高利历简化：每年 365 天，每月 30 天（战役 24-48 小时，跨年/月误差可忽略）
  return y * 365 * 24 * 60 + (mo - 1) * 30 * 24 * 60 + (d - 1) * 24 * 60 + h * 60 + mi;
}

/** 分钟数 → "1042年11月29日 14:20" */
export function 分钟转时刻(分钟: number): string {
  const y = Math.floor(分钟 / (365 * 24 * 60));
  let r = 分钟 % (365 * 24 * 60);
  const mo = Math.floor(r / (30 * 24 * 60)) + 1;
  r %= 30 * 24 * 60;
  const d = Math.floor(r / (24 * 60)) + 1;
  r %= 24 * 60;
  const h = Math.floor(r / 60);
  const mi = r % 60;
  return `${y}年${mo}月${d}日 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export interface 时间结算结果 {
  Δt: number;                    // 实际生效的时间流逝（分钟，0-720）
  新当前时刻: string;
  陷落度自动推进: number;         // 本回合因时间累计自动 +N 格
  算力恢复: number;              // 本回合恢复的算力
  智力成长: number;              // 本回合因时间累计自动 +N 点智力（每 10 游戏小时 1 点，上限 14）
  到期加成: string[];            // 到期被移除的加成来源名
}

/** 智力自动成长参数：每 10 游戏小时 +1，上限 14（智力不吃 AI 申报，只随时间涨） */
export const 智力成长分钟 = 600;
export const 智力上限 = 14;

/** 时间结算：算力恢复 / 临时加成扣减 / 陷落度自动推进 */
export function 结算时间(g: Game, 新时刻: string): { g: Game; 结果: 时间结算结果 } {
  const 旧分钟 = 时刻转分钟(g.时刻.当前时刻);
  const 新分钟 = 时刻转分钟(新时刻);
  if (旧分钟 == null || 新分钟 == null) {
    return { g, 结果: { Δt: 0, 新当前时刻: g.时刻.当前时刻, 陷落度自动推进: 0, 算力恢复: 0, 智力成长: 0, 到期加成: [] } };
  }

  let Δt = 新分钟 - 旧分钟;
  if (Δt < 0) Δt = 0;                       // 防呆：AI 报了更早的时刻
  if (Δt > 720) Δt = 720;                   // 封顶 12 小时

  const 新g: Game = JSON.parse(JSON.stringify(g));

  // 1. 算力恢复
  const 恢复 = Math.floor(Δt * 新g.算力.速率 / 60);
  const 上限 = 算力上限(新g);
  const 原算力 = 新g.算力.当前算力;
  新g.算力.当前算力 = Math.min(上限, 原算力 + 恢复);

  // 2. 临时加成扣减（主角 + 全生物）
  const 到期加成: string[] = [];
  const 扣减 = (加成列表: 临时加成[]): 临时加成[] => {
    return 加成列表.filter(b => {
      const 剩余 = b.剩余分钟 - Δt;
      if (剩余 <= 0) { 到期加成.push(b.来源); return false; }
      b.剩余分钟 = 剩余;
      return true;
    });
  };
  新g.主角.临时加成 = 扣减(新g.主角.临时加成);
  for (const k of Object.keys(新g.生物) as (keyof Game['生物'])[]) {
    新g.生物[k].临时加成 = 扣减(新g.生物[k].临时加成);
  }

  // 3. 陷落度自动推进：每累计满 240 分钟 +1
  const 旧累计 = 新g.时刻.累计分钟;
  新g.时刻.累计分钟 += Δt;
  const 旧格 = Math.floor(旧累计 / 240);
  const 新格 = Math.floor(新g.时刻.累计分钟 / 240);
  const 自动推进 = 新格 - 旧格;
  if (自动推进 > 0) {
    新g.时钟.维尔伦陷落度 = Math.min(6, 新g.时钟.维尔伦陷落度 + 自动推进);
  }

  // 4. 智力自动成长：每累计满 600 分钟（10 游戏小时）+1，上限 14
  let 智力成长 = 0;
  const 旧智档 = Math.floor(旧累计 / 智力成长分钟);
  const 新智档 = Math.floor(新g.时刻.累计分钟 / 智力成长分钟);
  if (新智档 > 旧智档) {
    const 目标 = Math.min(智力上限, 新g.主角.属性.智力 + (新智档 - 旧智档));
    智力成长 = 目标 - 新g.主角.属性.智力;
    新g.主角.属性.智力 = 目标;
  }

  // 5. 更新当前时刻
  新g.时刻.当前时刻 = 新时刻;

  return {
    g: 新g,
    结果: { Δt, 新当前时刻: 新时刻, 陷落度自动推进: 自动推进, 算力恢复: 恢复, 智力成长, 到期加成 },
  };
}

/* ═══════════════════════════════════════════════════════════════
   推演
   ═══════════════════════════════════════════════════════════════ */

export const 档位算力表: Record<number, number> = { 1: 10, 2: 25, 3: 50, 4: 150, 5: 400 };

export interface 推演结果 {
  成交: boolean;
  实付算力?: number;
  驳回原因?: string;
  触发裂隙?: boolean;            // 本回合累计消耗跨过 250，世界进入【裂隙】
  裂隙强化?: string[];           // 因裂隙被强化的魔物名
}

/** 推演扣费：算力够则扣，不够则驳回 */
export function 结算推演(g: Game, 名称: string, 档: number): { g: Game; 结果: 推演结果 } {
  const 定价 = 档位算力表[档];
  if (定价 == null) return { g, 结果: { 成交: false, 驳回原因: `非法档位 ${档}` } };

  if (g.算力.当前算力 < 定价) {
    return { g, 结果: { 成交: false, 驳回原因: '算力不足' } };
  }

  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 旧累计 = 新g.算力.累计消耗;
  新g.算力.当前算力 -= 定价;
  新g.算力.累计消耗 += 定价;
  新g.算力.推演记录.push({ 名称, 档, 实付算力: 定价, 时刻: 新g.时刻.当前时刻 });

  // 累计消耗跨过 250 → 世界进入【裂隙】，全城魔物狂暴化：魔物（类型=生物）全属性 +1（脚本自动应用，AI 不管）
  let 触发裂隙 = false;
  const 强化: string[] = [];
  if (旧累计 < 250 && 新g.算力.累计消耗 >= 250) {
    触发裂隙 = true;
    for (const 名 of Object.keys(新g.生物) as (keyof Game['生物'])[]) {
      const b = 新g.生物[名];
      if (b.类型 !== '生物') continue;          // 只强化魔物，不动人类 NPC
      for (const k of ['力量', '敏捷', '体质', '智力'] as const) {
        b.属性[k] = Math.min(23, b.属性[k] + 1);
      }
      强化.push(名 as string);
    }
  }

  return { g: 新g, 结果: { 成交: true, 实付算力: 定价, 触发裂隙, 裂隙强化: 强化 } };
}

/* ═══════════════════════════════════════════════════════════════
   属性 / 时钟 / 加成 / 物品 / 技能 / 生物
   ═══════════════════════════════════════════════════════════════ */

/** 属性变化：增量 ±2 钳制，基础值钳制 min-max */
export function 结算属性(
  g: Game,
  目标: '主角' | keyof Game['生物'],
  变化: Partial<Record<'力量' | '敏捷' | '体质' | '智力', number>>,
): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 目标 === '主角' ? 新g.主角 : 新g.生物[目标 as keyof Game['生物']];
  if (!对象) return g;

  const 上限 = 目标 === '主角' ? 13 : 23;   // NPC 不设 13 上限（按设计值域 1-23）
  for (const [k, v] of Object.entries(变化)) {
    const 属性名 = k as '力量' | '敏捷' | '体质' | '智力';
    const 钳制增量 = Math.max(-2, Math.min(2, v ?? 0));
    const 当前 = 对象.属性[属性名];
    对象.属性[属性名] = Math.max(1, Math.min(上限, 当前 + 钳制增量));
  }
  return 新g;
}

/** 主角状态（自由文本：持续伤势/中毒等；"健康" 即恢复正常） */
export function 结算主角状态(g: Game, 状态: string): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  新g.主角.状态 = 状态;
  return 新g;
}

/** 时钟申报：只增不减，钳制范围 */
export function 结算时钟(g: Game, 时钟名: '维尔伦陷落度' | '教会肃清进度', 增量: number): Game {
  if (增量 <= 0) return g;
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 上限 = 时钟名 === '维尔伦陷落度' ? 6 : 3;
  新g.时钟[时钟名] = Math.max(0, Math.min(上限, 新g.时钟[时钟名] + 增量));
  return 新g;
}

/** 临时加成新增 */
export function 结算临时加成新增(
  g: Game,
  目标: '主角' | keyof Game['生物'],
  加成: 临时加成,
): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 目标 === '主角' ? 新g.主角 : 新g.生物[目标 as keyof Game['生物']];
  if (!对象) return g;
  对象.临时加成.push({ ...加成 });
  return 新g;
}

/** 临时加成移除（按来源名） */
export function 结算临时加成移除(
  g: Game,
  目标: '主角' | keyof Game['生物'],
  来源: string,
): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 目标 === '主角' ? 新g.主角 : 新g.生物[目标 as keyof Game['生物']];
  if (!对象) return g;
  对象.临时加成 = 对象.临时加成.filter(b => b.来源 !== 来源);
  return 新g;
}

/** 下一件物品编号（数字字符串，取现有最大值 +1） */
export function 下一物品编号(g: Game): number {
  let max = 0;
  for (const i of g.物品) {
    const n = parseInt(i.编号, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** 物品新增：按 数量 展开成 N 条独立记录（每件一个编号，不堆叠） */
export function 结算物品新增(
  g: Game,
  物品: { 名称: string; 类型: 物品['类型']; 持有者?: string; 数量?: number; 描述?: string; 槽?: 物品['槽'] },
): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 份数 = Math.max(1, Math.floor(物品.数量 ?? 1));
  let 下一个 = 下一物品编号(新g);
  for (let k = 0; k < 份数; k++) {
    新g.物品.push({
      编号: String(下一个++),
      名称: 物品.名称,
      类型: 物品.类型,
      持有者: 物品.持有者 || '主角',
      描述: 物品.描述 || '',
      ...(物品.槽 ? { 槽: 物品.槽 } : {}),
    });
  }
  return 新g;
}

/** 找一件物品：先按编号精确匹配，再按名称（优先主角持有） */
export function 找物品(g: Game, 标识: string, 持有者?: string): 物品 | undefined {
  const 池 = 持有者 ? g.物品.filter(i => i.持有者 === 持有者) : g.物品;
  return 池.find(i => i.编号 === 标识)
    || 池.find(i => i.名称 === 标识 && i.持有者 === '主角')
    || 池.find(i => i.名称 === 标识);
}

/** 物品移除：按编号或名称删掉「一件」（同名多件只删第一件） */
export function 结算物品移除(g: Game, 标识: string, 持有者?: string): Game {
  const 片 = 找物品(g, 标识, 持有者);
  if (!片) return g;
  const 新g: Game = JSON.parse(JSON.stringify(g));
  新g.物品 = 新g.物品.filter(i => i !== 新g.物品.find(x => x.编号 === 片.编号));
  return 新g;
}

/** 物品数量变化：负数删 N 件（不足则全删）；正数按同名现有物品为模板复制 N 件（各有新编号） */
export function 结算物品数量(g: Game, 名称: string, 变化: number, 持有者: string = '主角'): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  if (变化 < 0) {
    let 删 = Math.abs(变化);
    const 保留: 物品[] = [];
    for (const i of 新g.物品) {
      if (删 > 0 && i.名称 === 名称 && i.持有者 === 持有者) { 删--; continue; }
      保留.push(i);
    }
    if (删 > 0) return g;                      // 数量不足 → 整体不动作（settle 记账）
    新g.物品 = 保留;
    return 新g;
  }
  if (变化 > 0) {
    const 模板 = 新g.物品.find(i => i.名称 === 名称 && i.持有者 === 持有者);
    if (!模板) return g;                       // 没有同名物品可作模板 → 不动作
    let 下一个 = 下一物品编号(新g);
    for (let k = 0; k < 变化; k++) {
      新g.物品.push({ ...模板, 编号: String(下一个++) });
    }
    return 新g;
  }
  return g;
}

/** 装备变更：目标可以是物品编号或物品名；校验持有者/类型/槽 */
export function 结算装备变更(
  g: Game,
  人物: '主角' | '爱丽丝',
  槽: '武器' | '副手' | '护甲' | '饰品',
  目标: string | null,
): { g: Game; 成功: boolean; 原因?: string } {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 人物 === '主角' ? 新g.主角 : 新g.生物.爱丽丝;
  if (!对象.装备) return { g, 成功: false, 原因: `${人物} 无装备系统` };

  if (目标 === null || 目标 === '') {           // 卸下
    对象.装备[槽] = null;
    return { g: 新g, 成功: true };
  }

  const 片 = 找物品(新g, 目标, 人物);
  if (!片) return { g, 成功: false, 原因: `物品 ${目标} 不存在或持有者不符` };
  if (片.类型 !== '装备') return { g, 成功: false, 原因: `${片.名称} 类型不是装备` };
  if (片.槽 !== 槽) return { g, 成功: false, 原因: `${片.名称} 槽位 ${片.槽 || '（无）'} 与目标槽 ${槽} 不匹配` };

  对象.装备[槽] = 片.编号;                       // 槽位存物品编号
  return { g: 新g, 成功: true };
}

/** 清空动作（每回合开始时由调度器调用） */
export function 清空动作(g: Game): Game {
  if (!g.动作 || g.动作.length === 0) return g;
  const 新g: Game = JSON.parse(JSON.stringify(g));
  新g.动作 = [];
  return 新g;
}

/** 追加一条动作记录 */
export function 追加动作(g: Game, 动作: { 类型: string; 名称: string; 编号?: string; 说明?: string }): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  if (!新g.动作) 新g.动作 = [];
  新g.动作.push({
    类型: 动作.类型,
    名称: 动作.名称,
    编号: 动作.编号 || '',
    说明: 动作.说明 || '',
    时刻: 新g.时刻?.当前时刻 || '',
  });
  return 新g;
}

/** 使用消耗品（状态栏操作）：删掉该件 + 记一条动作。仅限本人持有的「消耗品」 */
export function 使用消耗品(g: Game, 编号: string, 人物: string = '主角'): { g: Game; 成功: boolean; 原因?: string } {
  const 片 = g.物品.find(i => i.编号 === 编号);
  if (!片) return { g, 成功: false, 原因: `物品 #${编号} 不存在` };
  if (片.持有者 !== 人物) return { g, 成功: false, 原因: `#${编号} 不是${人物}持有的物品` };
  if (片.类型 !== '消耗品') return { g, 成功: false, 原因: `#${编号}（${片.名称}）不是消耗品` };

  const 新g: Game = JSON.parse(JSON.stringify(g));
  新g.物品 = 新g.物品.filter(i => i.编号 !== 编号);
  if (!新g.动作) 新g.动作 = [];
  新g.动作.push({
    类型: '使用消耗品',
    名称: 片.名称,
    编号: 片.编号,
    说明: 片.描述 || '',
    时刻: 新g.时刻?.当前时刻 || '',
  });
  return { g: 新g, 成功: true };
}

/** 技能新增 */
export function 结算技能新增(
  g: Game,
  人物: '主角' | keyof Game['生物'],
  技能: 技能,
): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 人物 === '主角' ? 新g.主角 : 新g.生物[人物 as keyof Game['生物']];
  if (!对象) return g;
  if (对象.技能.some(s => s.名称 === 技能.名称)) return g;   // 重名不重复加
  对象.技能.push({ ...技能 });
  return 新g;
}

/** 技能提升（阶梯 +1：入门→熟练→精通→大师；大师再升返回原样） */
export function 结算技能提升(
  g: Game,
  人物: '主角' | keyof Game['生物'],
  名称: string,
): { g: Game; 成功: boolean } {
  const 阶梯 = ['入门', '熟练', '精通', '大师'] as const;
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 人物 === '主角' ? 新g.主角 : 新g.生物[人物 as keyof Game['生物']];
  if (!对象) return { g, 成功: false };
  const 技 = 对象.技能.find(s => s.名称 === 名称);
  if (!技) return { g, 成功: false };
  const 当前阶 = 阶梯.indexOf(技.等阶);
  if (当前阶 < 0 || 当前阶 >= 3) return { g, 成功: false };   // 已是大师
  技.等阶 = 阶梯[当前阶 + 1];
  return { g: 新g, 成功: true };
}

/** 技能移除 */
export function 结算技能移除(
  g: Game,
  人物: '主角' | keyof Game['生物'],
  名称: string,
): Game {
  const 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 人物 === '主角' ? 新g.主角 : 新g.生物[人物 as keyof Game['生物']];
  if (!对象) return g;
  对象.技能 = 对象.技能.filter(s => s.名称 !== 名称);
  return 新g;
}

/** 生物字段更新（已遇见/状态/和主角的关系/属性增量） */
export function 结算生物(
  g: Game,
  名: keyof Game['生物'],
  更新: {
    已遇见?: boolean;
    状态?: string;
    和主角的关系?: string;
    属性?: Partial<Record<'力量' | '敏捷' | '体质' | '智力', number>>;
  },
): Game {
  let 新g: Game = JSON.parse(JSON.stringify(g));
  const 对象 = 新g.生物[名];
  if (!对象) return g;

  if (更新.已遇见 === true) 对象.已遇见 = true;   // 只能 false→true
  if (更新.状态 != null) 对象.状态 = 更新.状态;
  if (更新.和主角的关系 != null && (关系阶段.options as readonly string[]).includes(更新.和主角的关系)) {
    对象.和主角的关系 = 更新.和主角的关系 as typeof 对象.和主角的关系;
  }
  if (更新.属性) {
    for (const [k, v] of Object.entries(更新.属性)) {
      const 属性名 = k as '力量' | '敏捷' | '体质' | '智力';
      const 钳制增量 = Math.max(-2, Math.min(2, v ?? 0));
      对象.属性[属性名] = Math.max(1, Math.min(23, 对象.属性[属性名] + 钳制增量));
    }
  }
  return 新g;
}

/** 精练师等级：只升不降 */
export function 结算精练师等级(g: Game, 新等级: '无' | '低级' | '中级' | '高级'): Game {
  const 阶梯 = ['无', '低级', '中级', '高级'] as const;
  const 当前阶 = 阶梯.indexOf(g.主角.精练师等级);
  const 新阶 = 阶梯.indexOf(新等级);
  if (新阶 <= 当前阶) return g;
  const 新g: Game = JSON.parse(JSON.stringify(g));
  新g.主角.精练师等级 = 新等级;
  return 新g;
}
