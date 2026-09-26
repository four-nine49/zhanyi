// pipeline/contract.ts — 数据AI变更包契约（zod 校验）
//
// 变更包风格：MVU 式增量申报——只写发生变化的字段，没变的根本不出现。
// 所有字段均可选，唯一必填是 `当前时刻`。
// 校验原则：单条非法只丢该条记日志，不连坐其他条目；JSON 根本解析失败才整包丢弃。
import { z } from 'zod';
import { 物品类型, 装备槽, 技能等阶 } from '../core/schema';

/* ── 位置 ── */
const 位置变更 = z.object({
  当前: z.string().optional(),
  区域: z.enum(['下层', '中层', '上层', '城外']).optional(),
});

/* ── 时钟 ── */
const 时钟变更 = z.object({
  维尔伦陷落度: z.number().int().min(1).optional(),   // 只接受正增量
  教会肃清进度: z.number().int().min(1).optional(),
});

/* ── 推演 ── */
const 推演变更 = z.object({
  名称: z.string().min(1),
  档: z.number().int().min(1).max(5),
});

/* ── 属性 ── */
const 属性变化 = z.object({
  力量: z.number().int().optional(),
  敏捷: z.number().int().optional(),
  体质: z.number().int().optional(),
  智力: z.number().int().optional(),
});

/* ── 临时加成 ── */
const 临时加成新增项 = z.object({
  属性: z.enum(['力量', '敏捷', '体质', '智力']),
  值: z.number().int(),
  持续分钟: z.number().int().min(1),
  来源: z.string().min(1),
});

/* ── 物品 ── */
const 物品新增项 = z.object({
  名称: z.string().min(1),
  类型: 物品类型,
  持有者: z.string().default('主角'),
  数量: z.number().int().min(1).default(1),
  描述: z.string().default(''),
  槽: 装备槽.optional(),
});
const 装备变更项 = z.object({
  人物: z.enum(['主角', '爱丽丝']),
  槽: 装备槽,
  物品: z.string().nullable(),           // null = 卸下
});

/* ── 技能 ── */
const 技能新增项 = z.object({
  人物: z.string().min(1),               // "主角" 或生物名
  名称: z.string().min(1),
  等阶: 技能等阶,
  描述: z.string().default(''),
});
const 技能提升项 = z.object({
  人物: z.string().min(1),
  名称: z.string().min(1),
});
const 技能移除项 = z.object({
  人物: z.string().min(1),
  名称: z.string().min(1),
});

/* ── 生物 ── */
const 生物更新项 = z.object({
  已遇见: z.boolean().optional(),
  状态: z.string().optional(),
  // 取值白名单在 settle 里校验（非法值只丢该条不连坐整包；json_schema 已约束 AI 只能报枚举值）
  和主角的关系: z.string().optional(),
  属性: 属性变化.optional(),
});

/* ── 顶层变更包 ── */
export const 变更包Schema = z.object({
  当前时刻: z.string().regex(/^\d+年\d+月\d+日\s+\d+:\d+$/, '时刻格式须为 "1042年11月29日 14:20"'),

  位置: 位置变更.optional(),
  时钟: 时钟变更.optional(),
  推演: 推演变更.optional(),
  属性: 属性变化.optional(),
  主角状态: z.string().optional(),        // 自由文本；'健康' 即恢复正常

  临时加成新增: z.array(临时加成新增项).optional(),
  临时加成移除: z.array(z.string()).optional(),

  精练师等级: z.enum(['无', '低级', '中级', '高级']).optional(),

  物品新增: z.array(物品新增项).optional(),
  物品移除: z.array(z.string()).optional(),
  物品数量: z.record(z.string(), z.number().int()).optional(),
  装备变更: 装备变更项.optional(),

  技能新增: z.array(技能新增项).optional(),
  技能提升: z.array(技能提升项).optional(),
  技能移除: z.array(技能移除项).optional(),

  生物: z.record(z.string(), 生物更新项).optional(),
});

export type 变更包 = z.infer<typeof 变更包Schema>;

/** 逐条校验：返回 { 合法包, 丢弃日志 } */
export function 校验变更包(raw: unknown): { 包?: 变更包; 日志: string[] } {
  const 日志: string[] = [];
  const parsed = 变更包Schema.safeParse(raw);
  if (!parsed.success) {
    日志.push(`变更包整包校验失败: ${parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return { 日志 };
  }
  return { 包: parsed.data, 日志 };
}
