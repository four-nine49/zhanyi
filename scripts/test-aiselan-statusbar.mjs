// scripts/test-aiselan-statusbar.mjs — 状态栏毛坯版渲染自测（vm 沙箱 + 桩 DOM，无需浏览器）
// 用法：node scripts/test-aiselan-statusbar.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { sample } from './aiselan-sample.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HTML = resolve(ROOT, 'dist', '艾瑟兰状态栏.html');

if (!existsSync(HTML)) {
  console.error('找不到 dist/艾瑟兰状态栏.html —— 先跑 node build.mjs');
  process.exit(1);
}

const html = readFileSync(HTML, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('HTML 里找不到 <script>'); process.exit(1); }
const code = m[1];

const el = { innerHTML: '', addEventListener() {} };
const sandbox = {
  document: {
    readyState: 'complete',
    getElementById: (id) => (id === 'aiselan-bar' ? el : null),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {} },
  getVariables: ({ type, message_id }) => {
    if (type === 'message') return message_id === -1 ? { stat_data: { 艾瑟兰: sample } } : undefined;
    if (type === 'chat') return { 艾瑟兰: sample };
    return undefined;
  },
  getCurrentMessageId: () => 42,
  console,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

let 通过 = 0, 失败 = 0;
function has(名, 片段) {
  const ok = el.innerHTML.indexOf(片段) >= 0;
  if (ok) { 通过++; console.log('  ✓ ' + 名); }
  else { 失败++; console.log('  ✗ ' + 名 + '（找不到：' + 片段 + '）'); }
}
function hasNot(名, 片段) {
  const ok = el.innerHTML.indexOf(片段) < 0;
  if (ok) { 通过++; console.log('  ✓ ' + 名); }
  else { 失败++; console.log('  ✗ ' + 名 + '（不应出现：' + 片段 + '）'); }
}

console.log('— 状态栏渲染 —');
has('时刻', '1042年11月29日 16:47');
has('位置', '中层 · 灰石集市');
has('陷落度 3/6', '<b>3/6</b>');
has('陷落度阶段名', '沦陷期·水源带毒');
has('肃清 1/3', '<b>1/3</b>');
has('肃清阶段名', '锁定玩家');
has('世界状态=异象(105≥100)', '异象');
has('算力 70/220', '<b>70</b> / 220');
has('累计消耗 105', '<b>105</b>');
has('主角力量含临时 8(+1)', '8(+1)');
has('主角状态轻伤', '轻伤');
has('装备显示', '武器：精钢短剑');
has('技能显示', '剑术(熟练)');
has('物品-装备（不显示编号）', '精钢短剑[武器] — 被踩死的卫兵留下的');
has('已装备区块（武器槽）', '已装备（主角）');
has('卸下按钮', 'data-unequip="武器" data-who="主角"');
has('爱丽丝装备槽', 'data-who="爱丽丝"');
has('爱丽丝可装品按钮', 'data-equip="6" data-who="爱丽丝"');
has('消耗品「使用」按钮', 'data-use="2" data-who="主角"');
has('动作区块（空态）', '动作（本轮）');
has('消耗品第一件有使用按钮', 'data-use="2"');
has('同名第二件仍是独立条目', 'data-use="3"');
has('物品-材料', '硝石 — 爆破原料');
has('物品-特殊', '爆破物图纸 — 推演产物');
hasNot('默认不显示删除按钮（删除模式关）', 'data-del=');
has('物品区有删除模式开关', 'data-delmode="1"');
has('物品区有折叠开关', 'data-fold="1"');
hasNot('状态栏不显示编号（无 num 类）', 'class="num"');
hasNot('状态栏不显示编号文本', '>#');
has('爱丽丝在队', '在队');
has('爱丽丝敏捷=11', '力8 敏11 体10 智15');
has('爱丽丝关系显示', '关系：<b>熟人</b>');
has('诺拉关系显示', '关系：<b>相识</b>');
hasNot('敌对不显示关系行', '关系：<b>路人</b>');
has('诺拉留守', '留守在冒险者协会');
has('维克托敌对显示', '追查中');
has('虚空暴食魔死亡灰显', '已死亡');
hasNot('未遇见的瓦尔特不显示', '瓦尔特');
hasNot('未遇见的提尔雅不显示', '提尔雅');
hasNot('未遇见的马利基不显示', '马利基');
hasNot('未降临的异界幼体不显示', '异界幼体');

function eqv(名, 实, 期) {
  const ok = JSON.stringify(实) === JSON.stringify(期);
  if (ok) { 通过++; console.log('  ✓ ' + 名); }
  else { 失败++; console.log('  ✗ ' + 名 + '  期望=' + JSON.stringify(期) + ' 实际=' + JSON.stringify(实)); }
}

console.log('— 界面开关（删除模式 / 物品折叠）—');
{
  const E = sandbox.window.__AI_EQUIP__;
  E.设置删除模式(true);
  has('删除模式开启后出现删除按钮', 'data-del="2"');
  has('特殊物品同样可删', 'data-del="5"');
  has('删除模式提示语', '删除模式：点物品后的');
  E.设置删除模式(false);
  hasNot('退出删除模式后按钮消失', 'data-del="2"');
}
{
  const E = sandbox.window.__AI_EQUIP__;
  E.设置物品折叠(true);
  hasNot('折叠后不显示物品明细', '硝石');
  has('折叠后显示计数摘要', '消耗品×');
  has('摘要含特殊类', '特殊×');
  has('折叠后可展开', '>展开<');
  E.设置物品折叠(false);
  has('展开后恢复明细', '硝石 — 爆破原料');
}

console.log('— 地图卡片（内联图 / 折叠 / 全屏）—');
{
  const E = sandbox.window.__AI_EQUIP__;
  has('地图卡片存在', 'data-map="1"');
  hasNot('默认收起时不加载地图大图', 'data:image/webp');
  E.设置地图展开(true);
  has('展开后出现内联地图（data URI）', 'data:image/webp;base64,');
  has('地图 img 标签', 'class="ae-map"');
  has('提示不联网', '图片已内联，不联网');
  E.设置地图全屏(true);
  has('全屏类生效', 'ae-map full');
  E.设置地图全屏(false);
  E.设置地图展开(false);
  hasNot('收起后不再渲染大图', 'data:image/webp');
}

console.log('— 装备穿脱纯函数 —');
{
  const E = sandbox.window.__AI_EQUIP__;
  if (!E) { 失败++; console.log('  ✗ 未暴露 __AI_EQUIP__'); }
  else {
    const 深拷 = () => JSON.parse(JSON.stringify(sample));
    const r1 = E.卸下装备(深拷(), '主角', '武器');
    eqv('卸下武器', r1 && r1.主角.装备.武器, null);
    const r2 = E.装备物品(深拷(), '1', '主角');
    eqv('按编号装上（槽位存编号）', r2 && r2.主角.装备.武器, '1');
    eqv('材料不能装备', E.装备物品(深拷(), '4', '主角'), null);
    eqv('不存在编号不能装备', E.装备物品(深拷(), '99', '主角'), null);
    eqv('持有者不符不能装备', E.装备物品(深拷(), '6', '主角'), null);
    const r3 = E.装备物品(深拷(), '6', '爱丽丝');
    eqv('爱丽丝可按编号装上（护甲）', r3 && r3.生物.爱丽丝.装备.护甲, '6');
    eqv('非法槽位不动作', E.卸下装备(深拷(), '主角', '头盔'), null);
    eqv('可装物品过滤（主角：无未穿装备）', E.可装物品(深拷(), '主角').length, 0);
    const r5 = E.删除物品(深拷(), '1');
    eqv('删除物品少一件', r5 && r5.物品.length, 5);
    eqv('删除被穿着的物品会清空槽位', r5 && r5.主角.装备.武器, null);
    eqv('删除不存在编号不动作', E.删除物品(深拷(), '99'), null);
    const r6 = E.删除物品(深拷(), '6');
    eqv('可以删除非主角持有的物品', r6 && r6.物品.filter(function (i) { return i.编号 === '6'; }).length, 0);
    const r4 = E.使用消耗品(深拷(), '2', '主角');
    eqv('使用消耗品删一件', r4 && r4.物品.length, 5);
    eqv('使用消耗品记动作', r4 && r4.动作[0].名称, '治疗药剂');
    eqv('使用消耗品带时刻', r4 && r4.动作[0].时刻, '1042年11月29日 16:47');
    eqv('材料不能使用', E.使用消耗品(深拷(), '4', '主角'), null);
    eqv('爱丽丝的物品当前不能从主角处使用', E.使用消耗品(深拷(), '6', '爱丽丝'), null);
  }
}

console.log('');
console.log(失败 === 0 ? 'AISELAN STATUSBAR OK (' + 通过 + ' 项通过)' : 'FAILED: ' + 失败 + ' 项失败 / ' + 通过 + ' 项通过');
process.exit(失败 === 0 ? 0 : 1);
