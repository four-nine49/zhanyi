// ui/pages/aiselan-settings.ts — 艾瑟兰战役 · 设置页
//
// 战役自己的后台配置（此前面板里没有任何入口，只能手改 extensionSettings）：
//   ① 结算开关（开关.自动结算 / 开关.状态栏标记）
//   ② 数据AI 频率（频率.数据AI）
//   ③ 正文过滤（正文过滤：提取标签 / 排除标签 / 每轮字符上限）
//   ④ 数据AI 的 API（api.数据AI：跟随酒馆 / 自定义）
// 读写 aiselan/core/settings 的独立键 `艾瑟兰战役`；提示词在「战役·提示词」页编辑。
import { loadSettings as loadAe, saveSettings as saveAe, type Settings } from '../../aiselan/core/settings';

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
/** textarea 内容转义（只转 & 与 <，避免把 </textarea> 提前闭合） */
function escTa(s: unknown): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export function renderAiselanSettingsPage(el: HTMLElement): void {
  const s = loadAe();
  const api = s.api.数据AI;
  const f = s.正文过滤;
  const custom = api.mode === 'custom';

  el.innerHTML = `<div style="padding:16px;max-width:680px">
    <div class="of-h2" style="color:#89b4fa">艾瑟兰战役 · 设置</div>
    <div class="of-hint">这里的选项只作用于本战役的数据AI 与回合结算，与「渐变带」「剑与汽水」的设置各存各的、互不影响。</div>

    <div class="of-h2" style="color:#89b4fa;margin-top:20px">结算</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <input type="checkbox" id="ae-s-auto" ${s.开关.自动结算 ? 'checked' : ''}> 自动结算（每条 AI 回复后跑一次数据AI + 结算）
    </label>
    <div class="of-hint">关掉后不再自动跑，需要时到「艾瑟兰战役」页点「手动结算一次」。</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px">
      <input type="checkbox" id="ae-s-marker" ${s.开关.状态栏标记 ? 'checked' : ''}> 对话末尾加 <code>&lt;StatusPlaceHolderImpl/&gt;</code>
    </label>
    <div class="of-hint">AI 回复末尾补一个状态栏渲染锚点（已有不重复加）。关掉则状态栏不再自动出现。</div>

    <div class="of-h2" style="color:#89b4fa;margin-top:20px">数据AI 频率</div>
    <label class="of-label" style="margin-top:8px">每 N 条 AI 回复结算一次</label>
    <input class="of-input" type="number" min="1" id="ae-s-freq" value="${s.频率.数据AI}" style="width:120px">
    <div class="of-hint">填 1 = 每条都结算（默认）；填 2 = 隔一条结算一次。中间被跳过的楼层仅补状态栏标记。</div>

    <div class="of-h2" style="color:#89b4fa;margin-top:20px">正文取用</div>
    <div class="of-hint">发给数据AI 的正文按这里的规则取用与清洗；只影响数据AI 看到的内容，不改楼层原文。</div>
    <label class="of-label" style="margin-top:8px">读取轮数</label>
    <input class="of-input" type="number" min="1" id="ae-f-rounds" value="${f.轮数}" style="width:140px">
    <div class="of-hint">取最近几轮正文，<b>1 轮 = 你的输入 + 一条 AI 回复</b>（默认 4）。最后一轮当「本轮待结算正文」，更早的当「前文背景」。</div>
    <label class="of-label" style="margin-top:12px">提取标签（只发标签内的正文）</label>
    <textarea class="of-textarea" id="ae-f-ex" rows="2" placeholder="留空 = 不过滤，整段正文都发">${escTa(f.提取标签)}</textarea>
    <div class="of-hint">一对写一行：<code>开始|结束</code>。取【最后一对】之间的内容，多对拼一起。例：正文被 <code>&lt;content&gt;…&lt;/content&gt;</code> 包着就填 <code>&lt;content&gt;|&lt;/content&gt;</code>。</div>
    <label class="of-label" style="margin-top:12px">排除标签（把标签内的内容删掉）</label>
    <textarea class="of-textarea" id="ae-f-exc" rows="2" placeholder="留空 = 不排除">${escTa(f.排除标签)}</textarea>
    <div class="of-hint">同样一对一行，如思考块 <code>&lt;thinking&gt;|&lt;/thinking&gt;</code>。状态栏标记与三反引号代码块已默认剥掉，无需再填。</div>
    <label class="of-label" style="margin-top:12px">每轮正文字符上限</label>
    <input class="of-input" type="number" min="100" id="ae-f-max" value="${f.每轮字符上限}" style="width:140px">
    <div class="of-hint">每一条消息最多发多少字符（默认 3000）。调大可减少长楼结算项被截掉的风险，代价是 token 消耗上升。</div>

    <div class="of-h2" style="color:#89b4fa;margin-top:20px">数据AI API</div>
    <div class="of-hint">战役后台把正文翻译成增量变更包的 AI。默认「跟随酒馆当前 API」什么都不用配；想用便宜的独立模型就切「自定义」。</div>
    <select class="of-select" id="ae-api-mode" style="margin-top:8px;max-width:280px">
      <option value="tavern" ${!custom ? 'selected' : ''}>跟随酒馆当前 API</option>
      <option value="custom" ${custom ? 'selected' : ''}>自定义 API（独立配置）</option>
    </select>
    <div id="ae-api-custom" style="display:${custom ? '' : 'none'};margin-top:8px">
      <label class="of-label">代理预设（优先用）</label>
      <input class="of-input" id="ae-api-proxy" value="${esc(api.proxy_preset || '')}" placeholder="酒馆「代理」功能里保存的预设名">
      <div class="of-hint">填了它，下面的 URL / Key 都不用再填。</div>
      <label class="of-label" style="margin-top:12px">API URL（不用代理时直连地址）</label>
      <input class="of-input" id="ae-api-url" value="${esc(api.apiurl || '')}" placeholder="如 https://api.deepseek.com/v1">
      <label class="of-label" style="margin-top:12px">API Key</label>
      <input class="of-input" type="password" id="ae-api-key" value="${esc(api.key || '')}">
      <label class="of-label" style="margin-top:12px">模型</label>
      <input class="of-input" id="ae-api-model" value="${esc(api.model || '')}" placeholder="模型名">
      <div class="of-grid2" style="margin-top:12px">
        <div>
          <label class="of-label">温度</label>
          <input class="of-input" type="number" step="0.1" id="ae-api-temp" value="${api.temperature ?? 0.8}">
          <div class="of-hint">0～1，默认 0.8；只输出 JSON，不需要太发散</div>
        </div>
        <div>
          <label class="of-label">最大回复长度</label>
          <input class="of-input" type="number" id="ae-api-max" value="${api.max_tokens ?? 5000}">
          <div class="of-hint">单次结算回复的上限，默认 5000</div>
        </div>
      </div>
    </div>
    <button class="of-btn" id="ae-s-save" style="margin-top:16px">保存</button>
    <div class="of-hint">保存后立即生效（下一回合的结算就会用到）。</div>
  </div>`;

  // ── 结算 / 频率 / 正文过滤：改动即时保存 ──
  const autoCb = el.querySelector('#ae-s-auto') as HTMLInputElement;
  const markerCb = el.querySelector('#ae-s-marker') as HTMLInputElement;
  const freqInp = el.querySelector('#ae-s-freq') as HTMLInputElement;
  const roundsInp = el.querySelector('#ae-f-rounds') as HTMLInputElement;
  const exTa = el.querySelector('#ae-f-ex') as HTMLTextAreaElement;
  const excTa = el.querySelector('#ae-f-exc') as HTMLTextAreaElement;
  const maxInp = el.querySelector('#ae-f-max') as HTMLInputElement;
  const quickSave = () => {
    const cur = loadAe() as Settings;
    cur.开关.自动结算 = autoCb.checked;
    cur.开关.状态栏标记 = markerCb.checked;
    cur.频率.数据AI = Math.max(1, Math.round(parseInt(freqInp.value, 10) || 1));
    cur.正文过滤 = {
      轮数: Math.max(1, Math.round(parseInt(roundsInp.value, 10) || 4)),
      提取标签: exTa.value,
      排除标签: excTa.value,
      每轮字符上限: Math.max(100, Math.round(parseInt(maxInp.value, 10) || 3000)),
    };
    saveAe(cur);
    toastr?.success?.('已保存');
  };
  autoCb.addEventListener('change', quickSave);
  markerCb.addEventListener('change', quickSave);
  freqInp.addEventListener('change', quickSave);
  roundsInp.addEventListener('change', quickSave);
  exTa.addEventListener('change', quickSave);
  excTa.addEventListener('change', quickSave);
  maxInp.addEventListener('change', quickSave);

  // ── 数据AI API ──
  const modeSel = el.querySelector('#ae-api-mode') as HTMLSelectElement;
  modeSel.addEventListener('change', () => {
    (el.querySelector('#ae-api-custom') as HTMLElement).style.display = modeSel.value === 'custom' ? '' : 'none';
  });
  el.querySelector('#ae-s-save')!.addEventListener('click', () => {
    const cur = loadAe() as Settings;
    const mode = modeSel.value === 'custom' ? 'custom' : 'tavern';
    cur.api.数据AI = mode === 'custom'
      ? {
        mode,
        proxy_preset: (el.querySelector('#ae-api-proxy') as HTMLInputElement).value,
        apiurl: (el.querySelector('#ae-api-url') as HTMLInputElement).value,
        key: (el.querySelector('#ae-api-key') as HTMLInputElement).value,
        model: (el.querySelector('#ae-api-model') as HTMLInputElement).value,
        temperature: parseFloat((el.querySelector('#ae-api-temp') as HTMLInputElement).value) || 0.8,
        max_tokens: parseInt((el.querySelector('#ae-api-max') as HTMLInputElement).value, 10) || 5000,
      }
      : { mode: 'tavern' };
    saveAe(cur);
    toastr?.success?.(mode === 'custom' ? '已保存数据AI API（自定义）' : '数据AI 已切换为跟随酒馆当前 API');
  });
}
