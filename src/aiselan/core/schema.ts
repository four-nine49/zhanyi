// core/schema.ts — 艾瑟兰战役存档数据模型（zod）+ 缺省值
//
// 存档存在 chat 变量 `艾瑟兰` 键下，形状严格遵循《变量设计.md》§二。
// 快照同步到 message 变量 stat_data.艾瑟兰（剥掉 时刻.累计分钟 —— 任何 AI 永不可见）。
import { z } from 'zod';

/* ── 时刻 ── */
export const 时刻Schema = z.object({
  当前时刻: z.string(),              // 格里高利历 "1042年11月29日 14:20"
  累计分钟: z.number().int().min(0).default(0),  // 脚本内部账本，快照剥除
});

/* ── 位置 ── */
export const 位置Schema = z.object({
  当前: z.string(),                  // 自由文本，如 "审判广场"
  区域: z.enum(['下层', '中层', '上层', '城外']),
});

/* ── 时钟 ── */
export const 时钟Schema = z.object({
  维尔伦陷落度: z.number().int().min(0).max(6).default(0),
  教会肃清进度: z.number().int().min(0).max(3).default(0),
});

/* ── 算力 ── */
export const 推演记录Schema = z.object({
  名称: z.string(),
  档: z.number().int().min(1).max(5),
  实付算力: z.number().int().min(0),
  时刻: z.string(),                  // 成交时的 当前时刻
});
export const 算力Schema = z.object({
  当前算力: z.number().int().min(0).default(0),
  速率: z.number().int().min(1).default(10),     // 每小时恢复，第一卷恒定 10
  累计消耗: z.number().int().min(0).default(0),
  推演记录: z.array(推演记录Schema).default([]),
});

/* ── 物品 ── */
export const 物品类型 = z.enum(['装备', '消耗品', '材料', '特殊']);
export const 装备槽 = z.enum(['武器', '副手', '护甲', '饰品']);
export const 物品Schema = z.object({
  编号: z.string().default(''),                  // 每件物品独立编号（不堆叠：同名多件=多条记录）；旧档由 loadGame 迁移补齐
  名称: z.string().min(1),
  类型: 物品类型,
  持有者: z.string().default('主角'),            // "主角" 或生物名（爱丽丝/诺拉…）
  描述: z.string().default(''),
  槽: 装备槽.optional(),                          // 仅类型=装备时有
});

/* ── 属性块（主角/生物共用）── */
export const 属性Schema = z.object({
  力量: z.number().int().min(1).max(23),
  敏捷: z.number().int().min(1).max(23),
  体质: z.number().int().min(1).max(23),
  智力: z.number().int().min(1).max(23),
});

/* ── 临时加成 ── */
export const 临时加成Schema = z.object({
  属性: z.enum(['力量', '敏捷', '体质', '智力']),
  值: z.number().int(),                          // 可正可负
  剩余分钟: z.number().int().min(1),
  来源: z.string().min(1),                       // "战歌" "治疗药剂" 等
});

/* ── 技能 ── */
export const 技能等阶 = z.enum(['入门', '熟练', '精通', '大师']);
export const 技能Schema = z.object({
  名称: z.string().min(1),
  等阶: 技能等阶,
  描述: z.string().default(''),
});

/* ── 装备块（槽位 → 物品编号，null=空槽；旧档存的是物品名，loadGame 迁移为编号）── */
export const 装备块Schema = z.object({
  武器: z.string().nullable().default(null),
  副手: z.string().nullable().default(null),
  护甲: z.string().nullable().default(null),
  饰品: z.string().nullable().default(null),
});

/* ── 主角 ── */
export const 主角Schema = z.object({
  性别: z.enum(['男', '女']).default('男'),       // 开局界面选择；第一卷无数值影响，纯叙事
  属性: 属性Schema,
  临时加成: z.array(临时加成Schema).default([]),
  状态: z.string().default(''),                  // 自由文本 "轻伤" "中毒(每半小时判定)"
  技能: z.array(技能Schema).default([]),
  装备: 装备块Schema,
  精练师等级: z.enum(['无', '低级', '中级', '高级']).default('无'),
  已解锁知识库: z.array(z.string()).default(['地球']),  // 第一卷锁定，契约不开变更口子
});

/* ── 生物（同伴/敌对/boss 统一模板）── */
export const 生物类型 = z.enum(['核心', '重要', '生物']);
export const 生物立场 = z.enum(['同伴', '敌对', '中立']);
/** 与主角的关系阶段（剧情推进时由数据AI申报；敌方不申报） */
export const 关系阶段 = z.enum(['路人', '相识', '熟人', '恋人', '灵魂的另一半']);
export const 生物Schema = z.object({
  类型: 生物类型,
  立场: 生物立场,
  已遇见: z.boolean().default(false),
  状态: z.string().default(''),                  // 自由文本 "在队" "留守在协会" "死亡"
  和主角的关系: 关系阶段.default('路人'),        // 路人→相识→熟人→恋人→灵魂的另一半
  属性: 属性Schema,
  临时加成: z.array(临时加成Schema).default([]), // 同伴也可能有临时状态
  技能: z.array(技能Schema).default([]),
  装备: 装备块Schema.optional(),                 // 仅 爱丽丝 有（核心人物）
});

/* ── 八名建档对象（开局全量预设，属性取自沙盘文档）── */
export const 生物建档Schema = z.object({
  // —— 同伴（可招募）——
  爱丽丝: 生物Schema.extend({
    类型: z.literal('核心'),
    立场: z.literal('同伴'),
    装备: 装备块Schema,                           // 核心人物必须有装备块
  }),
  诺拉: 生物Schema.extend({ 类型: z.literal('重要'), 立场: z.literal('同伴') }),
  瓦尔特: 生物Schema.extend({ 类型: z.literal('重要'), 立场: z.literal('同伴') }),
  提尔雅: 生物Schema.extend({ 类型: z.literal('重要'), 立场: z.literal('同伴') }),
  // —— 敌对（绝不可招募）——
  维克托: 生物Schema.extend({ 类型: z.literal('重要'), 立场: z.literal('敌对') }),
  马利基: 生物Schema.extend({ 类型: z.literal('重要'), 立场: z.literal('敌对') }),
  // —— 可挑战生物（boss）——
  虚空暴食魔: 生物Schema.extend({ 类型: z.literal('生物'), 立场: z.literal('敌对') }),
  异界幼体: 生物Schema.extend({ 类型: z.literal('生物'), 立场: z.literal('敌对') }),
});

/* ── 动作（每轮清空的玩家操作流水；状态栏写入 → EJS 世界书条目注入正文AI）── */
export const 动作Schema = z.object({
  类型: z.string().min(1),                       // "使用消耗品"；后续可扩："推演"/"施法"/"装槽"…
  名称: z.string().min(1),                       // 物品名或动作名
  编号: z.string().default(''),                  // 涉及物品时填物品编号
  说明: z.string().default(''),                  // 自由文本（如物品描述），供正文AI理解
  时刻: z.string().default(''),                  // 记录时的游戏内时刻
});
export type 动作 = z.infer<typeof 动作Schema>;

/* ── 顶层存档 ── */
export const GameSchema = z.object({
  version: z.literal(1),
  时刻: 时刻Schema,
  位置: 位置Schema,
  时钟: 时钟Schema,
  算力: 算力Schema,
  物品: z.array(物品Schema).default([]),
  动作: z.array(动作Schema).default([]),       // 每轮清空（脚本在每回合开始时清），状态栏写入，EJS 读快照注入世界书
  主角: 主角Schema,
  生物: 生物建档Schema,
});

export type Game = z.infer<typeof GameSchema>;
export type 生物 = z.infer<typeof 生物Schema>;
export type 物品 = z.infer<typeof 物品Schema>;
export type 技能 = z.infer<typeof 技能Schema>;
export type 临时加成 = z.infer<typeof 临时加成Schema>;

/* ══════════════════════════════════════════════════════════════════
   开局默认档（第一卷 · 维尔伦沦陷沙盘）
   属性取自《第一卷_维尔伦沦陷沙盘.md》第三章人物
   ══════════════════════════════════════════════════════════════════ */
export const 开局存档: Game = {
  version: 1,
  时刻: { 当前时刻: '1042年11月29日 14:20', 累计分钟: 0 },
  位置: { 当前: '审判广场', 区域: '下层' },
  时钟: { 维尔伦陷落度: 0, 教会肃清进度: 0 },
  算力: { 当前算力: 0, 速率: 10, 累计消耗: 0, 推演记录: [] },
  物品: [],
  动作: [],
  主角: {
    性别: '男',
    属性: { 力量: 8, 敏捷: 8, 体质: 8, 智力: 11 },
    临时加成: [],
    状态: '',
    技能: [],
    装备: { 武器: null, 副手: null, 护甲: null, 饰品: null },
    精练师等级: '无',
    已解锁知识库: ['地球'],
  },
  生物: {
    // —— 同伴 ——
    爱丽丝: {
      类型: '核心', 立场: '同伴', 已遇见: false, 状态: '',
      和主角的关系: '路人',
      属性: { 力量: 8, 敏捷: 11, 体质: 10, 智力: 15 },
      临时加成: [], 技能: [],
      装备: { 武器: null, 副手: null, 护甲: null, 饰品: null },
    },
    诺拉: {
      类型: '重要', 立场: '同伴', 已遇见: false, 状态: '', 和主角的关系: '路人',
      属性: { 力量: 6, 敏捷: 11, 体质: 8, 智力: 13 },
      临时加成: [], 技能: [],
    },
    瓦尔特: {
      类型: '重要', 立场: '同伴', 已遇见: false, 状态: '', 和主角的关系: '路人',
      属性: { 力量: 12, 敏捷: 7, 体质: 11, 智力: 10 },
      临时加成: [], 技能: [],
    },
    提尔雅: {
      类型: '重要', 立场: '同伴', 已遇见: false, 状态: '', 和主角的关系: '路人',
      属性: { 力量: 7, 敏捷: 12, 体质: 8, 智力: 9 },
      临时加成: [], 技能: [],
    },
    // —— 敌对 ——
    维克托: {
      类型: '重要', 立场: '敌对', 已遇见: false, 状态: '', 和主角的关系: '路人',
      属性: { 力量: 12, 敏捷: 11, 体质: 12, 智力: 14 },
      临时加成: [], 技能: [],
    },
    马利基: {
      类型: '重要', 立场: '敌对', 已遇见: false, 状态: '', 和主角的关系: '路人',
      属性: { 力量: 14, 敏捷: 12, 体质: 14, 智力: 16 },
      临时加成: [], 技能: [],
    },
    // —— boss ——
    虚空暴食魔: {
      类型: '生物', 立场: '敌对', 已遇见: false, 状态: '关押于教会地下室', 和主角的关系: '路人',
      属性: { 力量: 15, 敏捷: 7, 体质: 16, 智力: 4 },
      临时加成: [], 技能: [],
    },
    异界幼体: {
      类型: '生物', 立场: '敌对', 已遇见: false, 状态: '未降临', 和主角的关系: '路人',
      属性: { 力量: 17, 敏捷: 15, 体质: 17, 智力: 12 },
      临时加成: [], 技能: [],
    },
  },
};
