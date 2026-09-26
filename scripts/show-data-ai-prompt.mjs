// scripts/show-data-ai-prompt.mjs — 打印数据AI 实际收到的完整提示词（占位符用样例数据填充）
//
// 用途：讨论/迭代提示词时对照真实拼装结果，避免手抄脱节。
// 用法：node scripts/show-data-ai-prompt.mjs
// 说明：与 pipeline/data-ai.ts 的拼装路径一致（同样的 segments、同样的 {{状态}}/{{正文}} 变量、
//       同样的 组装提示词 函数）；唯一差异是不做酒馆宏替换（substituteParams），并在最后标出。
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = ROOT.replace(/\\/g, '/');

const entry = `
import { 默认提示词 } from '${SRC}/src/aiselan/core/settings.ts';
import { serialize数据AI } from '${SRC}/src/aiselan/pipeline/serialize.ts';
import { 组装提示词 } from '${SRC}/src/gradband/pipeline/ai-common.ts';

/* ── 样例存档（第二天的中局：陷落度 2，肃清 1，算力 70/220，累计消耗 105=异象，爱丽丝在队） ── */
const g = {
  version: 1,
  时刻: { 当前时刻: '1042年11月29日 22:40', 累计分钟: 500 },
  位置: { 当前: '灰石集市·工坊区通风管道', 区域: '中层' },
  时钟: { 维尔伦陷落度: 2, 教会肃清进度: 1 },
  算力: { 当前算力: 70, 速率: 10, 累计消耗: 105, 推演记录: [{ 名称: '土制燃烧瓶', 档: 2, 实付算力: 25, 时刻: '1042年11月29日 19:10' }] },
  物品: [
    { 名称: '精钢短剑', 类型: '装备', 持有者: '主角', 数量: 1, 描述: '被踩死的卫兵留下的', 槽: '武器' },
    { 名称: '治疗药剂', 类型: '消耗品', 持有者: '主角', 数量: 1, 描述: '' },
    { 名称: '硝石', 类型: '材料', 持有者: '主角', 数量: 3, 描述: '爆破原料，来自补给车' },
    { 名称: '燃烧瓶图纸', 类型: '特殊', 持有者: '主角', 数量: 1, 描述: '推演产物，需火油与布条制造' },
  ],
  主角: {
    性别: '女',
    属性: { 力量: 8, 敏捷: 9, 体质: 9, 智力: 11 },
    临时加成: [{ 属性: '力量', 值: 1, 剩余分钟: 120, 来源: '战歌' }],
    状态: '轻伤',
    技能: [{ 名称: '剑术', 等阶: '熟练', 描述: '' }],
    装备: { 武器: '精钢短剑', 副手: null, 护甲: null, 饰品: null },
    精练师等级: '无',
    已解锁知识库: ['地球'],
  },
  生物: {
    爱丽丝: { 类型: '核心', 立场: '同伴', 已遇见: true, 状态: '在队', 和主角的关系: '相识', 属性: { 力量: 8, 敏捷: 11, 体质: 10, 智力: 15 }, 临时加成: [], 技能: [{ 名称: '自然魔法', 等阶: '入门', 描述: '' }], 装备: {} },
    诺拉: { 类型: '重要', 立场: '同伴', 已遇见: true, 状态: '留守在通风管道', 和主角的关系: '相识', 属性: { 力量: 6, 敏捷: 11, 体质: 8, 智力: 13 }, 临时加成: [], 技能: [] },
    瓦尔特: { 类型: '重要', 立场: '同伴', 已遇见: false, 状态: '', 和主角的关系: '路人', 属性: { 力量: 12, 敏捷: 7, 体质: 11, 智力: 10 }, 临时加成: [], 技能: [] },
    提尔雅: { 类型: '重要', 立场: '同伴', 已遇见: false, 状态: '', 和主角的关系: '路人', 属性: { 力量: 7, 敏捷: 12, 体质: 8, 智力: 9 }, 临时加成: [], 技能: [] },
    维克托: { 类型: '重要', 立场: '敌对', 已遇见: true, 状态: '在广场清点幸存者', 和主角的关系: '路人', 属性: { 力量: 12, 敏捷: 11, 体质: 12, 智力: 14 }, 临时加成: [], 技能: [] },
    马利基: { 类型: '重要', 立场: '敌对', 已遇见: false, 状态: '', 和主角的关系: '路人', 属性: { 力量: 14, 敏捷: 12, 体质: 14, 智力: 16 }, 临时加成: [], 技能: [] },
    虚空暴食魔: { 类型: '生物', 立场: '敌对', 已遇见: false, 状态: '关押于教会地下室', 和主角的关系: '路人', 属性: { 力量: 15, 敏捷: 7, 体质: 16, 智力: 4 }, 临时加成: [], 技能: [] },
    异界幼体: { 类型: '生物', 立场: '敌对', 已遇见: false, 状态: '未降临', 和主角的关系: '路人', 属性: { 力量: 17, 敏捷: 15, 体质: 17, 智力: 12 }, 临时加成: [], 技能: [] },
  },
};

/* ── 样例正文（分层：前文背景 + 本轮待结算）——假数据 ── */
const 前文背景 = [
  '【AI】火把落下的那一刻，火焰变成了沉甸甸的暗金色。广场中央塌陷的黑口子里，三头复眼甲虫正沿着碎石往上爬。你趁着人潮的缝隙钻进了西侧的巷子，一个自称诺拉的侏儒从通风管里探出头，把一个还在冒烟的小陶瓶塞进你手里："别站在路中间！"',
  '【玩家】我先确认爱丽丝有没有跟上来，然后跟诺拉进管道。',
  '【AI】爱丽丝跟着你钻了进来，裙角沾满灰。管道深处，诺拉一边拧铜管一边飞快地说话，她说工坊区还有半车硝石没人管，天亮前教会就会封死中层铁闸门。',
].join('\\n\\n');
const 本轮待结算正文 = [
  '【AI】你把燃烧瓶的图纸摊在铁皮上，按着记忆里最省料的做法改了两笔——火油灌到底、布条塞紧、蜡封口。诺拉凑过来看了三秒，眼睛亮起来："这玩意儿我十分钟能缝三个。"她翻出一卷布条扔给你，又问了一句你从哪里学来的。你避开了这个问题。',
  '铁皮外传来靴子踩碎石的声音，两支火把的光从通风口扫过去，是教会的巡逻队。爱丽丝本能地往你身后缩了半步，手指攥住你的衣角，呼吸压得很低。',
].join('\\n\\n');

const vars = {
  状态: serialize数据AI(g),
  正文: '【前文背景（仅供参考因果，严禁在此提取结算项目）】\\n' + 前文背景 + '\\n\\n【本轮待结算正文（唯一提取源）】\\n' + 本轮待结算正文,
};

const ordered = 组装提示词(默认提示词().数据AI, vars);

let total = 0;
console.log('════════ 数据AI 完整提示词（共 ' + ordered.length + ' 段 · 假数据填充） ════════');
ordered.forEach((s, i) => {
  total += s.content.length;
  console.log('');
  console.log('───── [' + (i + 1) + '/' + ordered.length + '] role=' + s.role + ' (' + s.content.length + ' 字符) ─────');
  console.log(s.content);
});
console.log('');
console.log('════════ 合计 ' + total + ' 字符（≈ ' + Math.round(total / 1.6) + ' tokens 中文估算） ════════');
console.log('注：实际调用时还会对每段做酒馆宏替换（substituteParams：{{user}} 等）。');
`;

const dir = mkdtempSync(join(tmpdir(), 'ae-prompt-'));
const out = join(dir, 'dump.mjs');
writeFileSync(join(dir, 'entry.ts'), entry);
await build({ entryPoints: [join(dir, 'entry.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });
