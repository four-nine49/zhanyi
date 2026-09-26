// scripts/test-aiselan.mjs — 艾瑟兰引擎数值自测（esbuild 打包后跑 node）
// 用法：node scripts/test-aiselan.mjs
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const entry = `
import { GameSchema, 开局存档 } from '${ROOT.replace(/\\/g, '/')}/src/aiselan/core/schema.ts';
import {
  算力上限, 世界状态, 时刻转分钟, 分钟转时刻, 结算时间, 结算推演,
  结算属性, 结算时钟, 结算装备变更, 结算临时加成新增, 结算技能提升,
} from '${ROOT.replace(/\\/g, '/')}/src/aiselan/engine/engine.ts';
import { settle } from '${ROOT.replace(/\\/g, '/')}/src/aiselan/pipeline/settle.ts';

let 通过 = 0, 失败 = 0;
function eq(名, 实, 期) {
  const ok = JSON.stringify(实) === JSON.stringify(期);
  if (ok) { 通过++; console.log('  ✓ ' + 名); }
  else { 失败++; console.log('  ✗ ' + 名 + '  期望=' + JSON.stringify(期) + ' 实际=' + JSON.stringify(实)); }
}

console.log('— schema —');
const g0 = GameSchema.parse(JSON.parse(JSON.stringify(开局存档)));
eq('开局档可 parse', true, !!g0);
eq('算力上限=20×智力(11)', 算力上限(g0), 220);
eq('世界状态 微澜', 世界状态(g0), '微澜');

console.log('— 时刻解析 —');
eq('时刻往返', 分钟转时刻(时刻转分钟('1042年11月29日 14:20')), '1042年11月29日 14:20');

console.log('— 时间结算 —');
{
  const { g, 结果 } = 结算时间(g0, '1042年11月29日 16:20');   // +120 分钟
  eq('Δt=120', 结果.Δt, 120);
  eq('算力恢复 +20', g.算力.当前算力, 20);
  eq('陷落度不推进(120<240)', g.时钟.维尔伦陷落度, 0);
  eq('累计分钟=120', g.时刻.累计分钟, 120);
}
{
  const { g, 结果 } = 结算时间(g0, '1042年11月29日 18:20');   // +240 分钟
  eq('满240分钟自动+1格', 结果.陷落度自动推进, 1);
  eq('陷落度=1', g.时钟.维尔伦陷落度, 1);
}
{
  const { 结果 } = 结算时间(g0, '1042年11月28日 14:20');       // 负数防呆
  eq('Δt<0 按0处理', 结果.Δt, 0);
}
{
  const { 结果 } = 结算时间(g0, '1042年11月31日 14:20');       // +2880 分钟
  eq('Δt>720 封顶720', 结果.Δt, 720);
}
{
  // 上限溢出：算力到 220 后再推进
  let gg = JSON.parse(JSON.stringify(g0));
  gg.算力.当前算力 = 215;
  const { g } = 结算时间(gg, '1042年11月29日 15:20');          // +60 → +10，钳到 220
  eq('算力封顶 220', g.算力.当前算力, 220);
}
{
  // 临时加成到期
  let gg = JSON.parse(JSON.stringify(g0));
  gg.主角.临时加成 = [{ 属性: '力量', 值: 1, 剩余分钟: 30, 来源: '战歌' }];
  const { g, 结果 } = 结算时间(gg, '1042年11月29日 15:20');    // +60
  eq('加成到期自动移除', g.主角.临时加成.length, 0);
  eq('到期来源记录', 结果.到期加成, ['战歌']);
}

console.log('— 推演 —');
{
  let gg = JSON.parse(JSON.stringify(g0));
  gg.算力.当前算力 = 100;
  const { g, 结果 } = 结算推演(gg, '爆破物制备', 3);
  eq('档3成交', 结果.成交, true);
  eq('扣费50', g.算力.当前算力, 50);
  eq('累计消耗50', g.算力.累计消耗, 50);
  eq('推演记录1条', g.算力.推演记录.length, 1);
}
{
  let gg = JSON.parse(JSON.stringify(g0));
  gg.算力.当前算力 = 30;
  const { 结果 } = 结算推演(gg, '爆破物制备', 3);
  eq('档3算力不足驳回', 结果.成交, false);
  eq('驳回原因', 结果.驳回原因, '算力不足');
}
{
  const { 结果 } = 结算推演(g0, 'x', 7);
  eq('非法档位驳回', 结果.成交, false);
}

console.log('— 钳制 —');
{
  const g = 结算属性(g0, '主角', { 体质: 5 });
  eq('属性单次≤+2', g.主角.属性.体质, 10);
}
{
  let gg = JSON.parse(JSON.stringify(g0));
  gg.主角.属性.智力 = 13;
  const g = 结算属性(gg, '主角', { 智力: 2 });
  eq('主角属性天花板13', g.主角.属性.智力, 13);
}
{
  const g = 结算时钟(g0, '维尔伦陷落度', 99);
  eq('陷落度钳制6', g.时钟.维尔伦陷落度, 6);
}

console.log('— 物品/装备 —');
{
  let gg = JSON.parse(JSON.stringify(g0));
  gg.物品.push({ 名称: '精钢短剑', 类型: '装备', 持有者: '主角', 数量: 1, 描述: '', 槽: '武器' });
  const r1 = 结算装备变更(gg, '主角', '武器', '精钢短剑');
  eq('装备上装成功', r1.成功, true);
  eq('装备槽写入', r1.g.主角.装备.武器, '精钢短剑');
  const r2 = 结算装备变更(gg, '主角', '护甲', '精钢短剑');
  eq('槽位不匹配驳回', r2.成功, false);
  const r3 = 结算装备变更(gg, '爱丽丝', '武器', '精钢短剑');
  eq('持有者不符驳回', r3.成功, false);
}

console.log('— 技能 —');
{
  let gg = JSON.parse(JSON.stringify(g0));
  gg.主角.技能 = [{ 名称: '剑术', 等阶: '入门', 描述: '' }];
  const r = 结算技能提升(gg, '主角', '剑术');
  eq('技能提升一阶', r.g.主角.技能[0].等阶, '熟练');
}

console.log('— settle 全包 —');
{
  let gg = JSON.parse(JSON.stringify(g0));
  gg.算力.当前算力 = 100;
  const { g, 日志, 丢弃 } = settle(gg, {
    当前时刻: '1042年11月29日 16:20',
    位置: { 当前: '灰石集市', 区域: '中层' },
    时钟: { 维尔伦陷落度: 1 },
    推演: { 名称: '爆破物制备', 档: 3 },
    属性: { 体质: 1 },
    临时加成新增: [{ 属性: '力量', 值: 1, 持续分钟: 180, 来源: '战歌' }],
    物品新增: [{ 名称: '硝石', 类型: '材料', 持有者: '主角', 数量: 3, 描述: '' }],
    生物: { 爱丽丝: { 已遇见: true, 状态: '在队' } },
  });
  eq('位置更新', g.位置.当前, '灰石集市');
  eq('陷落度=1(申报)', g.时钟.维尔伦陷落度, 1);
  eq('推演后算力=70(100+20-50)', g.算力.当前算力, 70);
  eq('属性+1', g.主角.属性.体质, 9);
  eq('临时加成入档', g.主角.临时加成.length, 1);
  eq('物品入档', g.物品[0].名称, '硝石');
  eq('爱丽丝已遇见', g.生物.爱丽丝.已遇见, true);
  eq('日志非空', 日志.length > 0, true);
  eq('无丢弃', 丢弃.length, 0);
}
{
  // 推演不足只丢该条，其余照常
  const { g, 丢弃 } = settle(g0, {
    当前时刻: '1042年11月29日 14:30',
    推演: { 名称: 'x', 档: 4 },
    属性: { 力量: 1 },
  });
  eq('推演驳回记丢弃', 丢弃.some(d => d.includes('算力不足')), true);
  eq('其余条目照常落地', g.主角.属性.力量, 9);
}
{
  // 非法生物名丢弃
  const { 丢弃 } = settle(g0, {
    当前时刻: '1042年11月29日 14:30',
    生物: { 维克托尔: { 状态: 'x' } },
  });
  eq('未建档生物丢弃', 丢弃.some(d => d.includes('不在建档列表')), true);
}
{
  // 和主角的关系：合法值入库 + 属性能改
  const { g } = settle(g0, {
    当前时刻: '1042年11月29日 14:30',
    生物: { 爱丽丝: { 和主角的关系: '灵魂的另一半' } },
  });
  eq('关系可申报（灵魂的另一半）', g.生物.爱丽丝.和主角的关系, '灵魂的另一半');
}
{
  // 和主角的关系：非法值只丢该字段，同条其它字段照常
  const { g, 丢弃 } = settle(g0, {
    当前时刻: '1042年11月29日 14:30',
    生物: { 爱丽丝: { 和主角的关系: '暧昧', 状态: '在队' } },
  });
  eq('关系非法值被丢弃', 丢弃.some(d => d.includes('取值非法')), true);
  eq('同条其它字段仍生效', g.生物.爱丽丝.状态, '在队');
  eq('关系保持原值（路人）', g.生物.爱丽丝.和主角的关系, '路人');
}
{
  // 爱丽丝敏捷改为 11（本次需求）
  eq('爱丽丝敏捷=11', g0.生物.爱丽丝.属性.敏捷, 11);
  eq('其余属性不变', JSON.stringify(g0.生物.爱丽丝.属性), JSON.stringify({ 力量: 8, 敏捷: 11, 体质: 10, 智力: 15 }));
}

console.log('');
console.log(失败 === 0 ? 'AISELAN ENGINE OK (' + 通过 + ' 项通过)' : 'FAILED: ' + 失败 + ' 项失败 / ' + 通过 + ' 项通过');
process.exit(失败 === 0 ? 0 : 1);
`;

const dir = mkdtempSync(join(tmpdir(), 'ae-test-'));
const out = join(dir, 'test.mjs');
writeFileSync(join(dir, 'entry.ts'), entry);
await build({
  entryPoints: [join(dir, 'entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});
await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });
