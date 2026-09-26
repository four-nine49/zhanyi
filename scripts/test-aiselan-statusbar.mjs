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

const el = { innerHTML: '' };
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
has('物品-装备', '精钢短剑×1[武器]');
has('物品-消耗品', '治疗药剂×2');
has('物品-材料', '硝石×3');
has('物品-特殊', '爆破物图纸×1');
has('爱丽丝在队', '在队');
has('诺拉留守', '留守在冒险者协会');
has('维克托敌对显示', '追查中');
has('虚空暴食魔死亡灰显', '已死亡');
hasNot('未遇见的瓦尔特不显示', '瓦尔特');
hasNot('未遇见的提尔雅不显示', '提尔雅');
hasNot('未遇见的马利基不显示', '马利基');
hasNot('未降临的异界幼体不显示', '异界幼体');

console.log('');
console.log(失败 === 0 ? 'AISELAN STATUSBAR OK (' + 通过 + ' 项通过)' : 'FAILED: ' + 失败 + ' 项失败 / ' + 通过 + ' 项通过');
process.exit(失败 === 0 ? 0 : 1);
