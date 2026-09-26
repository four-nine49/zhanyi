// core/settings.ts — 艾瑟兰战役 扩展设置（独立 extensionSettings 键，与渐变带互不干扰）
//
// 与渐变带共用类型定义（PromptSegment / ApiConfig），但存自己的键 '艾瑟兰战役'。
import { readExtensionSettings, writeExtensionSettings } from '../../bridge/tavern';
import type { ApiConfig, PromptSegment } from '../../gradband/core/settings';

export const SETTINGS_KEY = '艾瑟兰战役';

export interface Settings {
  开关: {
    自动结算: boolean;       // 数据AI + settle，每条AI回复后
    状态栏标记: boolean;     // AI回复末尾追加 <StatusPlaceHolderImpl/>
  };
  频率: { 数据AI: number };  // 每N条AI回复一次，默认1
  api: { 数据AI: ApiConfig };
  提示词: { 数据AI: PromptSegment[] };
  窗口?: { x: number; y: number; w: number; h: number };
  悬浮球?: { x: number; y: number };
}

export const STATUS_MARKER = '<StatusPlaceHolderImpl/>';

/** 默认提示词模板。占位符：{{状态}} {{正文}} */
export function 默认提示词() {
  const 数据AI: PromptSegment[] = [
    {
      role: 'system', enabled: true, note: '任务与铁律（艾瑟兰战役）', content: `你是跑团系统"艾瑟兰战役"的数据AI。你的唯一职责：阅读最新一轮正文，把发生的变化翻译成增量变更包（JSON）。
铁律：
1. 你不做任何算术。算力恢复、推演扣费、时钟自动推进、临时加成倒计时全部由本地脚本结算，你永远不要报这些。
2. 只申报"发生变化"的字段，没变化的字段一律不出现（不是空值，是根本不写）。大多数回合只需报"当前时刻"。
3. 你只能报告事实，不能发明账单或凭空创造物品。物品新增必须有正文依据（捡到/获得/制作完成/购买）。
4. 只输出 JSON，字段以下方 schema 为准，额外的字段会被整包拒绝。
5. "当前时刻"格式固定为"1042年11月29日 14:20"（年月日 时:分），从正文推断剧情当前时间；正文未提时间推进就沿用【当前状态】里的时刻。
6. 推演：仅当玩家明确指令系统推演时申报。档位：档1原始工具/档2简单机械/档3复杂机械/档4工业技术/档5电子技术。推演只产图纸不产实物——成交后图纸由脚本处理，你不需要再报物品（除非正文另有"制造完成"）。
7. 时钟申报（增量数字）：
   - 维尔伦陷落度：仅当玩家引发大规模战斗或爆破（时间推进由脚本自动算，你不报）。
   - 教会肃清进度：仅当玩家在教会人员面前使用系统产物或异术 / 与审判庭正面冲突 / 目击者增加。例外：走圣堂裂隙道不推进。
8. 属性变化（增量，单次≤2）：仅当达成结算条件——越级击杀（力或敏+1）/ 濒死生还（体+1）/ 破解真相、关键推演、打通节点（智+1）。日常行动不提属性。
9. 临时加成：药剂、战歌等临时效果，必须报持续分钟（游戏内时间）与来源名；效果被打断/驱散时用"临时加成移除"报来源名。
10. 生物：仅限 爱丽丝/诺拉/瓦尔特/提尔雅/维克托/马利基/虚空暴食魔/异界幼体 八名建档对象。**敌对立场（维克托/马利基/虚空暴食魔/异界幼体）绝不可招募、绝不转为同伴**——他们可以被杀、被骗、被暂时利用，但永不入队。初遇某名建档对象时用"生物"字段报 已遇见: true。
11. 异界幼体：陷落度到达 5/6 时申报 状态: "已降临于圣阳大教堂"。
12. 事件范围铁律（防重复结算）：【最近正文】分两层——【前文背景】＝上一轮及更早（已在历史回合结算过）；【本轮待结算正文】＝最新一轮。所有申报必须且仅限由【本轮待结算正文】中尘埃落定的事实产生，严禁从前文背景重复提取已结算事件。`,
    },
    { role: 'system', enabled: true, note: '状态注入（脚本生成）', content: '【当前状态】\n{{状态}}' },
    { role: 'system', enabled: true, note: '最近正文（脚本生成·分层：前文背景＝上一轮及更早｜本轮待结算正文＝最新一轮）', content: '【最近正文】\n{{正文}}' },
    {
      role: 'system', enabled: true, note: '输出格式示例（示范 · 非校验）', content: `【输出格式示例（只写发生的变化；没发生的一律不出现）】
{"当前时刻": "1042年11月29日 16:47"}
或（有变化时，按需组合）：
{"当前时刻": "1042年11月29日 16:47","位置": {"当前": "灰石集市","区域": "中层"},"时钟": {"维尔伦陷落度": 1},"推演": {"名称": "爆破物制备","档": 3},"属性": {"体质": 1},"临时加成新增": [{"属性": "力量","值": 1,"持续分钟": 180,"来源": "战歌"}],"物品数量": {"治疗药剂": -1},"生物": {"爱丽丝": {"已遇见": true,"状态": "在队"}}}`,
    },
    { role: 'user', enabled: true, note: '收尾指令', content: '请按 schema 输出本轮增量变更包 JSON。只写发生变化的字段，其余不出现。' },
  ];

  return { 数据AI };
}

export function 默认设置(): Settings {
  return {
    开关: { 自动结算: true, 状态栏标记: true },
    频率: { 数据AI: 1 },
    api: { 数据AI: { mode: 'tavern' } },
    提示词: 默认提示词(),
  };
}

let cache: Settings | null = null;

export function loadSettings(): Settings {
  if (cache) return cache;
  const def = 默认设置();
  const raw = readExtensionSettings<Partial<Settings>>(SETTINGS_KEY, {});
  cache = {
    开关: {
      自动结算: typeof raw.开关?.自动结算 === 'boolean' ? raw.开关.自动结算 : def.开关.自动结算,
      状态栏标记: typeof raw.开关?.状态栏标记 === 'boolean' ? raw.开关.状态栏标记 : def.开关.状态栏标记,
    },
    频率: { 数据AI: (raw.频率 && typeof raw.频率.数据AI === 'number' ? raw.频率.数据AI : def.频率.数据AI) },
    api: { 数据AI: raw.api?.数据AI ?? def.api.数据AI },
    提示词: { 数据AI: raw.提示词?.数据AI ?? def.提示词.数据AI },
    窗口: raw.窗口,
    悬浮球: raw.悬浮球,
  };
  return cache;
}

export function saveSettings(s: Settings): void {
  cache = s;
  writeExtensionSettings(SETTINGS_KEY, s);
}

export function resetSettingsCache(): void { cache = null; }
