// ui/pages/tools.ts — 工具页：版本号 / 手动填表 / 数据同步（开关+手动） / 楼层同步数据清除
import { VERSION } from '../../core/version';
import { loadSettings, saveSetting } from '../../core/settings';
import { runFill, isBusy } from '../../schedule/trigger';
import {
  syncToLastFloor, clearSyncRange, setAutoSync,
} from '../../sync/message-sync';
import { setStatusPlaceholder } from '../../sync/status-placeholder';
import { getLastMessageId } from '../../bridge/tavern';

export function renderToolsPage(el: HTMLElement): void {
  const s = loadSettings();
  const lastFloor = getLastMessageId();

  el.innerHTML = `<div style="padding:16px;max-width:680px">
    <div style="display:flex;align-items:center;margin-bottom:4px">
      <div class="of-h1" style="margin:0">工具</div>
      <span class="of-badge of-badge-idle" style="margin-left:10px">艾瑟兰战役 v${VERSION}</span>
    </div>
    <div class="of-hint" style="margin-bottom:16px">手动填表、楼层变量同步、清理等实用操作都在这一页。</div>

    <div class="of-card">
      <div class="of-h2" style="font-size:13px">手动填表</div>
      <div class="of-hint" style="margin-bottom:8px">立即对所有「参与自动填表」的表跑一次填表（按各自分组分别请求）。自动填表关着时也能用。</div>
      <button class="of-btn" id="of-tool-fill">立即填表</button>
      <span class="of-hint" id="of-tool-fill-state" style="margin-left:10px"></span>
    </div>

    <div class="of-card">
      <div class="of-h2" style="font-size:13px">数据同步（楼层变量）</div>
      <div class="of-hint" style="margin-bottom:8px">把当前<b>所有表</b>的快照写进楼层变量 <code>stat_data.开局框架</code>（形状：<code>{ 表名: [{列名: 值}…] }</code>），供状态栏 / 前端界面从消息变量读取。写在最新楼，同一楼重复同步会覆盖。</div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <input type="checkbox" id="of-tool-autosync"> 自动同步（收到 AI 回复、以及每次填表完成后，自动写入对应楼层）
      </label>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <button class="of-btn" id="of-tool-sync">手动同步到最新楼</button>
        <span class="of-hint" id="of-tool-sync-state"></span>
      </div>
      <div class="of-hint" style="margin-top:4px">最新楼当前是：${lastFloor < 0 ? '（还没有消息）' : `第 ${lastFloor} 楼`}。手动改过表格数据后，点一下手动同步即可刷新楼层变量。</div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px">
        <input type="checkbox" id="of-tool-marker"> 对话末尾加 <code>&lt;StatusPlaceHolderImpl/&gt;</code>（状态栏渲染锚点）
      </label>
      <div class="of-hint">和「状态栏数据同步」脚本同款行为：收到 AI 回复后，若楼末没有标记就补一个（用户楼不处理、已有不重复）。开启时会顺手给最新 AI 楼补一次。会修改消息内容，介意慎开。</div>
    </div>

    <div class="of-card">
      <div class="of-h2" style="font-size:13px">清除楼层同步数据</div>
      <div class="of-hint" style="margin-bottom:8px">同步数据存在每楼的变量里，聊天文件会慢慢变大。定期清掉旧楼层的同步数据即可（只删 <code>stat_data.开局框架</code>，不碰消息内容和其它变量）。</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span>从第</span><input class="of-input" type="number" id="of-tool-clear-from" value="0" style="width:90px">
        <span>楼 到 第</span><input class="of-input" type="number" id="of-tool-clear-to" value="${Math.max(0, lastFloor)}" style="width:90px">
        <span>楼</span>
        <button class="of-btn of-btn-danger" id="of-tool-clear">清除</button>
      </div>
      <div class="of-hint" id="of-tool-clear-state" style="margin-top:6px"></div>
    </div>
  </div>`;

  // ── 手动填表 ──
  const fillBtn = el.querySelector('#of-tool-fill') as HTMLButtonElement;
  const fillState = el.querySelector('#of-tool-fill-state') as HTMLElement;
  fillBtn.addEventListener('click', async () => {
    if (isBusy()) { toastr?.warning?.('正在填表中，请稍候'); return; }
    fillBtn.disabled = true;
    fillState.textContent = '填表中…';
    try { await runFill({ reason: 'manual' }); }
    finally {
      fillBtn.disabled = false;
      fillState.textContent = '';
    }
  });

  // ── 数据同步 ──
  const autoCb = el.querySelector('#of-tool-autosync') as HTMLInputElement;
  autoCb.checked = s.autoSyncEnabled;
  autoCb.addEventListener('change', () => {
    setAutoSync(autoCb.checked);
    toastr?.success?.(autoCb.checked ? '已开启自动同步' : '已关闭自动同步');
  });

  const syncBtn = el.querySelector('#of-tool-sync') as HTMLButtonElement;
  const syncState = el.querySelector('#of-tool-sync-state') as HTMLElement;
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncState.textContent = '同步中…';
    const r = await syncToLastFloor();
    syncBtn.disabled = false;
    if (r.ok) {
      syncState.textContent = `已写入第 ${r.floor} 楼（${r.tables} 张表）`;
      toastr?.success?.(`已同步 ${r.tables} 张表到第 ${r.floor} 楼变量`);
    } else {
      syncState.textContent = '';
      toastr?.error?.('同步失败：' + (r.error || '未知错误'));
    }
  });

  // ── 状态栏标记 ──
  const markerCb = el.querySelector('#of-tool-marker') as HTMLInputElement;
  markerCb.checked = s.statusPlaceholderEnabled;
  markerCb.addEventListener('change', () => {
    void setStatusPlaceholder(markerCb.checked);
    toastr?.success?.(markerCb.checked ? '已开启状态栏标记' : '已关闭状态栏标记');
  });

  // ── 清除 ──
  const clearBtn = el.querySelector('#of-tool-clear') as HTMLButtonElement;
  const clearState = el.querySelector('#of-tool-clear-state') as HTMLElement;
  clearBtn.addEventListener('click', async () => {
    const from = parseInt((el.querySelector('#of-tool-clear-from') as HTMLInputElement).value, 10);
    const to = parseInt((el.querySelector('#of-tool-clear-to') as HTMLInputElement).value, 10);
    if (isNaN(from) || isNaN(to)) { toastr?.warning?.('请填写楼层范围'); return; }
    if (!confirm(`清除第 ${Math.min(from, to)}～${Math.max(from, to)} 楼的同步数据？（只删 stat_data.开局框架，不动消息内容）`)) return;
    clearBtn.disabled = true;
    clearState.textContent = '清除中…';
    const r = await clearSyncRange(from, to);
    clearBtn.disabled = false;
    clearState.textContent = `已扫描 ${r.scanned} 楼，清除 ${r.cleared} 楼的同步数据`;
    toastr?.success?.(`已清除 ${r.cleared} 楼的同步数据`);
  });
}
