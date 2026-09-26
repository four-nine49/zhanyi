// pipeline/data-ai.ts — 战役数据AI：正文 → 增量变更包（json_schema 强制）→ 契约校验
//
// 复用：
//   - gradband/pipeline/ai-common 的 组装提示词 / customApiOf / recentStoryLayered（纯函数）
//   - gradband/pipeline/contract 的 抽取JSON（通用 JSON 提取）
//   - fill/api-call 的 callGenerate（generateRaw 封装）
// 只换提示词来源（本战役 settings）与输出契约（aiselan/pipeline/contract）。
import { substituteParams } from '../../bridge/tavern';
import { callGenerate } from '../../fill/api-call';
import { 组装提示词, customApiOf, recentStoryLayered } from '../../gradband/pipeline/ai-common';
import { 抽取JSON } from '../../gradband/pipeline/contract';
import { loadSettings } from '../core/settings';
import { 校验变更包, type 变更包 } from './contract';
import { serialize数据AI } from './serialize';
import type { Game } from '../core/schema';

/* json_schema：全字段可选，唯一必填 当前时刻 —— 强制 AI 只报变化 */
const SCHEMA = {
  name: 'aiselan_change_pack',
  value: {
    type: 'object',
    properties: {
      当前时刻: { type: 'string', description: '格式：1042年11月29日 16:47（年月日 时:分）' },
      位置: {
        type: 'object',
        properties: {
          当前: { type: 'string', description: '具体地点名，如 "审判广场"' },
          区域: { type: 'string', enum: ['下层', '中层', '上层', '城外'] },
        },
        additionalProperties: false,
      },
      时钟: {
        type: 'object',
        properties: {
          维尔伦陷落度: { type: 'integer', minimum: 1, description: '仅当大规模战斗/爆破时申报增量' },
          教会肃清进度: { type: 'integer', minimum: 1, description: '仅当教会面前暴露异术/正面冲突/目击者增加时申报增量' },
        },
        additionalProperties: false,
      },
      推演: {
        type: 'object',
        properties: {
          名称: { type: 'string', description: '推演的技术名，如 "爆破物制备"' },
          档: { type: 'integer', minimum: 1, maximum: 5, description: '档1原始工具/档2简单机械/档3复杂机械/档4工业技术/档5电子技术' },
        },
        required: ['名称', '档'],
        additionalProperties: false,
      },
      属性: {
        type: 'object',
        properties: {
          力量: { type: 'integer' }, 敏捷: { type: 'integer' },
          体质: { type: 'integer' }, 智力: { type: 'integer' },
        },
        additionalProperties: false,
      },
      临时加成新增: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            属性: { type: 'string', enum: ['力量', '敏捷', '体质', '智力'] },
            值: { type: 'integer' },
            持续分钟: { type: 'integer', minimum: 1 },
            来源: { type: 'string', description: '如 "战歌" "治疗药剂"' },
          },
          required: ['属性', '值', '持续分钟', '来源'],
          additionalProperties: false,
        },
      },
      临时加成移除: { type: 'array', items: { type: 'string', description: '按来源名移除' } },
      精练师等级: { type: 'string', enum: ['无', '低级', '中级', '高级'] },
      物品新增: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            名称: { type: 'string' },
            类型: { type: 'string', enum: ['装备', '消耗品', '材料', '特殊'] },
            持有者: { type: 'string', description: '默认 "主角"' },
            数量: { type: 'integer', minimum: 1 },
            描述: { type: 'string' },
            槽: { type: 'string', enum: ['武器', '副手', '护甲', '饰品'], description: '仅类型=装备时' },
          },
          required: ['名称', '类型'],
          additionalProperties: false,
        },
      },
      物品移除: { type: 'array', items: { type: 'string' } },
      物品数量: { type: 'object', additionalProperties: { type: 'integer' }, description: '物品名 → 增量，如 {"治疗药剂": -1}' },
      装备变更: {
        type: 'object',
        properties: {
          人物: { type: 'string', enum: ['主角', '爱丽丝'] },
          槽: { type: 'string', enum: ['武器', '副手', '护甲', '饰品'] },
          物品: { type: ['string', 'null'], description: '物品名，null=卸下' },
        },
        required: ['人物', '槽', '物品'],
        additionalProperties: false,
      },
      技能新增: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            人物: { type: 'string', description: '"主角" 或建档生物名' },
            名称: { type: 'string' },
            等阶: { type: 'string', enum: ['入门', '熟练', '精通', '大师'] },
            描述: { type: 'string' },
          },
          required: ['人物', '名称', '等阶'],
          additionalProperties: false,
        },
      },
      技能提升: {
        type: 'array',
        items: {
          type: 'object',
          properties: { 人物: { type: 'string' }, 名称: { type: 'string' } },
          required: ['人物', '名称'],
          additionalProperties: false,
        },
      },
      技能移除: {
        type: 'array',
        items: {
          type: 'object',
          properties: { 人物: { type: 'string' }, 名称: { type: 'string' } },
          required: ['人物', '名称'],
          additionalProperties: false,
        },
      },
      生物: {
        type: 'object',
        description: '仅限 爱丽丝/诺拉/瓦尔特/提尔雅/维克托/马利基/虚空暴食魔/异界幼体',
        additionalProperties: {
          type: 'object',
          properties: {
            已遇见: { type: 'boolean', description: '只能 false→true' },
            状态: { type: 'string', description: '自由文本："在队"/"留守在协会"/"死亡"' },
            属性: {
              type: 'object',
              properties: {
                力量: { type: 'integer' }, 敏捷: { type: 'integer' },
                体质: { type: 'integer' }, 智力: { type: 'integer' },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    required: ['当前时刻'],
    additionalProperties: false,
  },
};

export interface 数据AI结果 {
  ok: boolean;
  pack?: 变更包;
  error?: string;
  raw?: string;
}

/** 调用数据AI并校验。失败（API错/JSON坏/契约拒）返回 ok:false。 */
export async function runDataAI(g: Game): Promise<数据AI结果> {
  const settings = loadSettings();
  const segments = settings.提示词.数据AI;

  const 正文L = recentStoryLayered(4);
  const 正文 = '【前文背景（仅供参考因果，严禁在此提取结算项目）】\n'
    + (正文L.bg || '（无）')
    + '\n\n【本轮待结算正文（唯一提取源）】\n'
    + (正文L.latest || '（无）');

  const vars: Record<string, string> = {
    状态: serialize数据AI(g),
    正文,
  };

  // 组装 + 宏替换（复用渐变带 ai-common 的组装函数）
  const ordered = 组装提示词(segments, vars).map(s => ({ role: s.role, content: substituteParams(s.content) }));

  try {
    const r = await callGenerate({
      orderedPrompts: ordered as any,
      jsonSchema: SCHEMA,
      customApi: customApiOf(settings.api.数据AI),
      generationId: `aiselan-data-${Date.now()}`,
    });
    if (!r.ok || !r.text) return { ok: false, error: r.error || 'AI 返回为空' };

    const json = 抽取JSON(r.text);
    if (!json) return { ok: false, error: '无法从返回值提取 JSON', raw: r.text.slice(0, 500) };

    const { 包, 日志 } = 校验变更包(json);
    if (!包) return { ok: false, error: 日志.join('；') || '契约校验失败', raw: r.text.slice(0, 500) };
    return { ok: true, pack: 包, raw: r.text.slice(0, 500) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '数据AI 调用异常' };
  }
}
