// ui/pages/settings.ts — 设置页：界面（悬浮按钮）+ 引导对话 API + 全局默认 + 调度（全字段带中文解释）
// （填表 API 与渐变带 数据AI/法术AI 的 API 配置已移至独立「API」页 ui/pages/api.ts）
//
// 按模式分段：战役模式下只有「界面」段与战役通用——引导对话 API / 全局默认 / 调度都属
// 「剑与汽水·开局框架」标准表格，战役不用，故不渲染；战役自己的设置看「战役·设置」页。
import { loadSettings, saveSetting, saveSettingsPatch } from '../../core/settings';
import { updateDialogueApi } from '../../store/settings';
import { setToggleVisible } from '../../window/toggle';
import { resetGuidedEngine } from '../state';
import { startAutoFill, stopAutoFill } from '../../schedule/trigger';
import { currentMode } from '../app';

export function renderSettingsPage(el: HTMLElement): void {
  const s = loadSettings();
  const da = s.dialogueApi;
  const g = s.globalDefaults;
  const 战役模式 = currentMode() === 'aiselan';

  el.innerHTML = `<div style="padding:16px;max-width:680px">
    <div class="of-h2" style="color:#89b4fa">界面</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
      <input type="checkbox" id="of-u-toggle"> 显示悬浮按钮（🎬，可拖拽移动）
    </label>
    <div class="of-hint">关掉后仍可用 /opening 命令或在酒馆扩展设置里恢复。</div>

    ${战役模式 ? `
    <div class="of-hint" style="margin-top:20px">本模式（战役）的结算开关、数据AI 频率与数据AI API 在「战役·设置」页配置；这里只保留通用界面项。</div>
    ` : `
    <div class="of-h2" style="color:#89b4fa;margin-top:20px">引导对话 API（开局引导的 AI）</div>
    <div class="of-hint">「AI 对话」页里陪你做开局引导的 AI，和填表 API 相互独立。默认直接用酒馆当前连接的 API；想用别的模型就切「自定义」。</div>
    <select class="of-select" id="of-d-mode" style="margin-top:8px;max-width:280px">
      <option value="tavern" ${da.mode === 'tavern' ? 'selected' : ''}>跟随酒馆当前 API</option>
      <option value="custom" ${da.mode === 'custom' ? 'selected' : ''}>自定义 API（独立配置）</option>
    </select>
    <div id="of-d-custom" style="display:${da.mode === 'custom' ? '' : 'none'};margin-top:8px">
      <label class="of-label">代理预设（优先用）</label><input class="of-input" id="of-d-proxy" value="${da.proxyPreset || ''}" placeholder="酒馆「代理」功能里保存的预设名">
      <label class="of-label" style="margin-top:12px">API URL（不用代理时直连地址）</label><input class="of-input" id="of-d-url" value="${da.apiUrl || ''}" placeholder="如 https://api.deepseek.com/v1">
      <label class="of-label" style="margin-top:12px">API Key</label><input class="of-input" type="password" id="of-d-key" value="${da.apiKey || ''}">
      <label class="of-label" style="margin-top:12px">模型</label><input class="of-input" id="of-d-model" value="${da.model || ''}" placeholder="引导对话用的模型名">
      <div class="of-grid3" style="margin-top:12px">
        <div>
          <label class="of-label">温度</label><input class="of-input" type="number" step="0.1" id="of-d-temp" value="${da.temperature}">
          <div class="of-hint">引导对话建议 0.7～1，太低说话发死（默认 0.8）</div>
        </div>
        <div>
          <label class="of-label">最大回复长度</label><input class="of-input" type="number" id="of-d-max" value="${da.maxTokens}">
          <div class="of-hint">引导回复可能较长，建议 2048 以上（默认 5000）</div>
        </div>
        <div>
          <label class="of-label">接口类型</label><input class="of-input" id="of-d-src" value="${da.source || ''}" placeholder="保持 openai">
        </div>
      </div>
    </div>
    <button class="of-btn" id="of-d-save" style="margin-top:12px">保存对话 API</button>
    <div class="of-hint">保存后立即生效（已有引导对话历史不受影响）。</div>

    <div class="of-h2" style="color:#89b4fa;margin-top:20px">全局默认</div>
    <div class="of-hint">单张表没有单独设置时，用这里的值兜底（单表在「表结构/配置」页设置）。</div>
    <div class="of-grid2" style="margin-top:8px">
      <div>
        <label class="of-label">读取对话轮数</label><input class="of-input" type="number" id="of-g-rounds" value="${g.contextRounds}">
        <div class="of-hint">AI 填表时能看到几轮对话。1 轮 = 你发一句 + AI 回一句</div>
      </div>
      <div>
        <label class="of-label">填表频率</label><input class="of-input" type="number" id="of-g-freq" value="${g.updateFrequency}">
        <div class="of-hint">每累计 N 条 AI 回复填一次表。填 2 = 隔一条填一次</div>
      </div>
      <div>
        <label class="of-label">跳过最近楼层</label><input class="of-input" type="number" id="of-g-skip" value="${g.skipFloors}">
        <div class="of-hint">最近 N 条消息不参与本次填表（刚生成还没读完时用）</div>
      </div>
      <div>
        <label class="of-label">只发最近 N 行</label><input class="of-input" type="number" id="of-g-latest" value="${g.sendLatestRows}">
        <div class="of-hint">a 档表格的行数上限，-1 = 全部行</div>
      </div>
    </div>
    <label class="of-label" style="margin-top:12px">正文提取标签（全局默认）</label><textarea class="of-textarea" id="of-g-ex" rows="2">${g.extractTags || ''}</textarea>
    <div class="of-hint">只把「开始|结束」之间的正文发给 AI，一对写一行。留空 = 不过滤，全部正文都发。例：输出被 <code>&lt;content&gt;…&lt;/content&gt;</code> 包着，就填 <code>&lt;content&gt;|&lt;/content&gt;</code>。</div>
    <label class="of-label" style="margin-top:12px">正文排除标签（全局默认）</label><textarea class="of-textarea" id="of-g-exc" rows="2">${g.excludeTags || ''}</textarea>
    <div class="of-hint">把「开始|结束」之间的内容从正文里删掉再发（如思考过程、代码块）。</div>
    <button class="of-btn" id="of-g-save" style="margin-top:12px">保存</button>

    <div class="of-h2" style="color:#89b4fa;margin-top:20px">调度</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="of-s-auto" ${s.autoFillEnabled ? 'checked' : ''}> 启用标准表格（自动填表）</label>
    <div class="of-hint">默认开启。关掉后标准数据表格不再自动填表（可手动填）；仅影响开局框架标准表，与「渐变带的数据AI/法术AI」和「战役数据AI」无关。</div>
    <label class="of-label" style="margin-top:12px">失败重试次数</label><input class="of-input" type="number" id="of-s-retry" value="${s.maxRetries}" style="width:120px">
    <div class="of-hint">某次请求失败时静默重试几次，填 0 = 不重试。</div>
    `}
  </div>`;

  // ── 界面：悬浮按钮 ──
  const toggleCb = el.querySelector('#of-u-toggle') as HTMLInputElement;
  toggleCb.checked = s.floatingToggleEnabled;
  toggleCb.addEventListener('change', () => {
    setToggleVisible(toggleCb.checked);
    toastr?.info?.(toggleCb.checked ? '已显示悬浮按钮' : '已隐藏悬浮按钮（可在酒馆扩展设置里恢复）');
  });

  // 战役模式：以下三段不渲染，直接结束
  if (战役模式) return;

  // ── 填表 API 已移至「API」页（ui/pages/api.ts）──

  // ── 引导对话 API（保存后重建引擎立即生效；会话历史不受影响）──
  const dModeSel = el.querySelector('#of-d-mode') as HTMLSelectElement;
  dModeSel.addEventListener('change', () => {
    (el.querySelector('#of-d-custom') as HTMLElement).style.display = dModeSel.value === 'custom' ? '' : 'none';
  });
  el.querySelector('#of-d-save')!.addEventListener('click', () => {
    const mode = dModeSel.value === 'custom' ? 'custom' : 'tavern';
    if (mode === 'custom') {
      updateDialogueApi({
        mode,
        proxyPreset: (el.querySelector('#of-d-proxy') as HTMLInputElement).value,
        apiUrl: (el.querySelector('#of-d-url') as HTMLInputElement).value,
        apiKey: (el.querySelector('#of-d-key') as HTMLInputElement).value,
        model: (el.querySelector('#of-d-model') as HTMLInputElement).value,
        temperature: parseFloat((el.querySelector('#of-d-temp') as HTMLInputElement).value) || 0.8,
        maxTokens: parseInt((el.querySelector('#of-d-max') as HTMLInputElement).value, 10) || 5000,
        source: (el.querySelector('#of-d-src') as HTMLInputElement).value || 'openai',
      });
    } else {
      updateDialogueApi({ mode });
    }
    resetGuidedEngine();
    toastr?.success?.(mode === 'custom' ? '已保存引导对话 API（自定义）' : '引导对话已切换为跟随酒馆当前 API');
  });

  // ── 全局默认 ──
  el.querySelector('#of-g-save')!.addEventListener('click', () => {
    saveSettingsPatch({
      globalDefaults: {
        ...g,
        contextRounds: parseInt((el.querySelector('#of-g-rounds') as HTMLInputElement).value, 10) || 3,
        updateFrequency: parseInt((el.querySelector('#of-g-freq') as HTMLInputElement).value, 10) || 3,
        skipFloors: parseInt((el.querySelector('#of-g-skip') as HTMLInputElement).value, 10) || 0,
        sendLatestRows: (() => { const v = parseInt((el.querySelector('#of-g-latest') as HTMLInputElement).value, 10); return isNaN(v) ? -1 : v; })(),
        extractTags: (el.querySelector('#of-g-ex') as HTMLTextAreaElement).value,
        excludeTags: (el.querySelector('#of-g-exc') as HTMLTextAreaElement).value,
      },
    });
    toastr?.success?.('已保存全局默认');
  });

  // ── 调度（改动即时生效：启动/停止自动填表监听）──
  const autoCb = el.querySelector('#of-s-auto') as HTMLInputElement;
  const retryInp = el.querySelector('#of-s-retry') as HTMLInputElement;
  const saveAuto = () => {
    saveSetting('autoFillEnabled', autoCb.checked);
    saveSetting('maxRetries', parseInt(retryInp.value, 10) || 0);
    if (autoCb.checked) startAutoFill(); else stopAutoFill();
    toastr?.success?.('已保存（自动填表' + (autoCb.checked ? '已开启' : '已关闭') + '）');
  };
  autoCb.addEventListener('change', saveAuto);
  retryInp.addEventListener('change', saveAuto);
}
