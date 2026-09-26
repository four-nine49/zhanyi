// ui/pages/aiselan.ts — 艾瑟兰战役 主页（第3模式）
//
// 内容：存档初始化/重置、当前状态总览（时刻/位置/时钟/算力/主角/物品/已遇见生物）、
// 手动结算、最近回合日志。只读存档 + 调 aiselanApi；不做复杂编辑（编辑走提示词页/数据页）。
import { getVariables } from '../../bridge/tavern';
import { loadGame } from '../../aiselan/core/store';
import { aiselanApi } from '../../aiselan/index';
import { 算力上限, 世界状态, 陷落度阶段名, 生效属性 } from '../../aiselan/engine/engine';
import type { Game } from '../../aiselan/core/schema';

export function renderAiselanPage(el: HTMLElement): void {
  renderAll(el);
}

function renderAll(el: HTMLElement): void {
  const g = loadGame();
  const 日志 = (getVariables({ type: 'chat' })?.['艾瑟兰日志'] ?? null) as any;

  el.innerHTML = `<div style="padding:16px">
    <div class="of-h1">艾瑟兰战役 · 第一卷</div>
    <div class="of-hint" style="margin-bottom:12px">维尔伦沦陷沙盘。存档在 chat 变量 <code>艾瑟兰</code>；数据AI 每回合把正文变化翻译成增量变更包，脚本结算。</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button class="of-btn of-btn-ok" id="ae-inject">注入开局面板到最新楼</button>
      ${g ? `
        <button class="of-btn of-btn-ghost" id="ae-settle">手动结算一次</button>
        <button class="of-btn of-btn-ghost" id="ae-sync">同步快照</button>
        <button class="of-btn of-btn-danger" id="ae-reset">重置存档</button>
      ` : `
        <button class="of-btn of-btn-ghost" id="ae-init">快速初始化（默认属性）</button>
      `}
    </div>
    <div id="ae-body"></div>
    <div id="ae-log" style="margin-top:12px"></div>
  </div>`;

  const body = el.querySelector('#ae-body') as HTMLElement;
  if (!g) {
    body.innerHTML = `<div class="of-card"><div class="of-h2">尚未开局</div>
      <div class="of-hint">点「初始化开局存档」写入开局档（主角力敏体8/智11、审判广场开局、四时钟归零）。</div></div>`;
  } else {
    body.innerHTML = 渲染状态(g);
  }

  const logEl = el.querySelector('#ae-log') as HTMLElement;
  if (日志) {
    const 行 = [...(日志.log || [])];
    if (日志.丢弃?.length) 行.push(...日志.丢弃.map((d: string) => '⚠ ' + d));
    if (日志.error) 行.push('❌ ' + 日志.error);
    logEl.innerHTML = `<div class="of-card"><div class="of-h2">最近回合（${日志.时间 || ''}）</div>
      <div class="of-hint" style="white-space:pre-wrap;line-height:1.7">${行.length ? 行.join('\n') : '（无动作）'}</div></div>`;
  }

  // ── 按钮 ──
  el.querySelector('#ae-inject')?.addEventListener('click', async () => {
    const ok = await aiselanApi.injectOpeningToLatest();
    if (ok) toastr?.success?.('已把 <艾瑟兰开局/> 标记注入最新楼（需已导入 regex-艾瑟兰开局.json 才会显示面板）');
    else toastr?.error?.('注入失败：没有可用楼层');
  });
  el.querySelector('#ae-init')?.addEventListener('click', async () => {
    await aiselanApi.initNewGame();
    toastr?.success?.('艾瑟兰开局存档已写入');
    renderAll(el);
  });
  el.querySelector('#ae-reset')?.addEventListener('click', async () => {
    if (!confirm('重置存档？当前进度会全部丢失，回到开局值。')) return;
    await aiselanApi.resetGame();
    toastr?.success?.('存档已重置');
    renderAll(el);
  });
  el.querySelector('#ae-settle')?.addEventListener('click', async () => {
    toastr?.info?.('开始手动结算…');
    const r = await aiselanApi.manualTurn();
    if (r.error) toastr?.error?.(r.error);
    else toastr?.success?.('结算完成');
    renderAll(el);
  });
  el.querySelector('#ae-sync')?.addEventListener('click', async () => {
    await aiselanApi.syncSnapshot();
    toastr?.success?.('快照已同步到最新楼');
  });
}

function 进度条(值: number, 上限: number, 颜色: string): string {
  const 百分比 = 上限 > 0 ? Math.min(100, Math.round(值 / 上限 * 100)) : 0;
  return `<div style="background:rgba(255,255,255,.08);border-radius:4px;height:10px;overflow:hidden">
    <div style="width:${百分比}%;height:100%;background:${颜色}"></div></div>`;
}

function 渲染状态(g: Game): string {
  const 上限 = 算力上限(g);
  const 世界 = 世界状态(g);
  const 主 = g.主角;
  const 临时总 = (名: '力量' | '敏捷' | '体质' | '智力') => {
    const 基 = 主.属性[名]; const 生 = 生效属性(g, 名);
    return 生 !== 基 ? `${生}<span class="of-hint" style="font-size:11px">(${基}${生 - 基 > 0 ? '+' : ''}${生 - 基})</span>` : `${基}`;
  };

  const 已遇见 = (Object.entries(g.生物) as [string, Game['生物'][keyof Game['生物']]][]).filter(([, b]) => b.已遇见);
  const 同伴 = 已遇见.filter(([, b]) => b.立场 === '同伴');
  const 敌对 = 已遇见.filter(([, b]) => b.立场 === '敌对');

  const 生物卡 = (名: string, b: Game['生物'][keyof Game['生物']]) => {
    const 死 = b.状态 === '死亡';
    return `<div class="of-card" style="padding:8px 10px;${死 ? 'opacity:.45' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>${名}</b><span class="of-hint" style="font-size:11px">${b.立场}${死 ? ' · 已死亡' : ''}</span>
      </div>
      <div class="of-hint" style="font-size:12px;line-height:1.6">
        力${b.属性.力量} 敏${b.属性.敏捷} 体${b.属性.体质} 智${b.属性.智力}${b.临时加成.length ? '（临时：' + b.临时加成.map(x => `${x.属性}${x.值 > 0 ? '+' : ''}${x.值}`).join('、') + '）' : ''}
        ${b.状态 && !死 ? `<br>状态：${b.状态}` : ''}
        ${b.立场 === '同伴' ? `<br>关系：<b>${b.和主角的关系}</b>` : ''}
        ${b.技能.length ? `<br>技能：${b.技能.map(s => `${s.名称}(${s.等阶})`).join('、')}` : ''}
      </div>
    </div>`;
  };

  const 物品组 = (类型: string) => g.物品.filter(i => i.类型 === 类型);
  const 物品行 = (列表: typeof g.物品) => 列表.length
    ? 列表.map(i => `<div class="of-hint" style="font-size:12px;line-height:1.7">· ${i.名称}×${i.数量}${i.槽 ? `[${i.槽}]` : ''}${i.持有者 !== '主角' ? `（${i.持有者}）` : ''}${i.描述 ? ` — ${i.描述}` : ''}</div>`).join('')
    : '<div class="of-hint" style="font-size:12px">（无）</div>';

  return `
  <div class="of-card">
    <div class="of-h2" style="margin-bottom:8px">世界</div>
    <div class="of-hint" style="font-size:12px;line-height:1.9">
      时刻：${g.时刻.当前时刻}｜位置：${g.位置.区域} · ${g.位置.当前}<br>
      陷落度：${g.时钟.维尔伦陷落度}/6（${陷落度阶段名(g.时钟.维尔伦陷落度)}）
      ${进度条(g.时钟.维尔伦陷落度, 6, '#e64553')}
      肃清进度：${g.时钟.教会肃清进度}/3
      ${进度条(g.时钟.教会肃清进度, 3, '#df8e1d')}
      世界状态：<b style="${世界 === '裂隙' ? 'color:#f38ba8' : 世界 === '异象' ? 'color:#f9e2af' : ''}">${世界}</b>
    </div>
  </div>

  <div class="of-card">
    <div class="of-h2" style="margin-bottom:8px">算力</div>
    <div class="of-hint" style="font-size:12px;line-height:1.9">
      当前：<b>${g.算力.当前算力}</b> / ${上限}（速率 ${g.算力.速率}/小时）
      ${进度条(g.算力.当前算力, 上限, '#89b4fa')}
      累计消耗：${g.算力.累计消耗}（异象 100 / 裂隙 250）
      ${进度条(g.算力.累计消耗, 250, '#cba6f7')}
    </div>
    ${g.算力.推演记录.length ? `<div class="of-hint" style="font-size:11px;margin-top:6px;line-height:1.7">推演记录：${g.算力.推演记录.map(r => `${r.名称}(档${r.档},-${r.实付算力})`).join('、')}</div>` : ''}
  </div>

  <div class="of-card">
    <div class="of-h2" style="margin-bottom:8px">主角</div>
    <div class="of-hint" style="font-size:12px;line-height:1.9">
      力量 ${临时总('力量')}｜敏捷 ${临时总('敏捷')}｜体质 ${临时总('体质')}｜智力 ${临时总('智力')}<br>
      ${主.状态 ? `状态：${主.状态}<br>` : ''}
      装备：${Object.entries(主.装备).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join('、') || '（无）'}<br>
      精练师等级：${主.精练师等级}｜知识库：${主.已解锁知识库.join('、')}
      ${主.技能.length ? `<br>技能：${主.技能.map(s => `${s.名称}(${s.等阶})`).join('、')}` : ''}
    </div>
  </div>

  <div class="of-card">
    <div class="of-h2" style="margin-bottom:8px">物品</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div><div class="of-hint" style="font-size:11px;margin-bottom:2px">装备</div>${物品行(物品组('装备'))}</div>
      <div><div class="of-hint" style="font-size:11px;margin-bottom:2px">消耗品</div>${物品行(物品组('消耗品'))}</div>
      <div><div class="of-hint" style="font-size:11px;margin-bottom:2px">材料</div>${物品行(物品组('材料'))}</div>
      <div><div class="of-hint" style="font-size:11px;margin-bottom:2px">特殊</div>${物品行(物品组('特殊'))}</div>
    </div>
  </div>

  <div class="of-card">
    <div class="of-h2" style="margin-bottom:8px">已遇见（同伴 ${同伴.length}｜敌对 ${敌对.length}）</div>
    ${已遇见.length === 0 ? '<div class="of-hint" style="font-size:12px">（无 —— 剧情中初遇后自动出现）</div>' : `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${同伴.map(([名, b]) => 生物卡(名, b)).join('')}
        ${敌对.map(([名, b]) => 生物卡(名, b)).join('')}
      </div>`}
  </div>`;
}
