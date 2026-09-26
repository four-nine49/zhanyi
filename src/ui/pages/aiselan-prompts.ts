// ui/pages/aiselan-prompts.ts — 艾瑟兰战役 提示词编辑页（数据AI 一套）+ 最终提示词预览
//
// 交互与渐变带提示词页一致：ON/OFF、↑↓、删除、新增、恢复默认。占位符：{{状态}} {{正文}}
// 「最终提示词预览」用真实存档 + 最近正文拼装（占位符已替换），与数据AI 实际收到的完全一致。
import { loadSettings, saveSettings, 默认提示词, type Settings } from '../../aiselan/core/settings';
import { loadGame } from '../../aiselan/core/store';
import { 组装数据AI提示词 } from '../../aiselan/pipeline/data-ai';

const WHICH = '数据AI' as const;

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function renderAiselanPromptsPage(el: HTMLElement): void {
  const state: { flush: () => void } = { flush: () => { /* 由分组渲染填入 */ } };

  el.innerHTML = `<div style="padding:16px">
    <div class="of-h1">艾瑟兰战役 · 提示词</div>
    <div class="of-hint" style="margin-bottom:12px">数据AI 一套（读正文 → 输出增量变更包）。<b>ON/OFF</b> 控制这段发不发，↑↓ 调顺序，可删可加、可恢复默认。
      可用占位符：<code>{{状态}}</code>（上一轮状态·本回合开始前的基线摘要）、<code>{{正文}}</code>（分层正文），以及酒馆原生宏 <code>{{user}}</code> <code>{{char}}</code> 等；
      写错成别的名字不会被替换（会原样发给 AI）。改完点下方「生成预览」可看到实际发出的内容。</div>

    <div class="of-card" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="of-h2" style="margin:0">最终提示词预览</div>
        <span class="of-hint" style="font-size:11px">用当前存档 + 最近正文真实拼装，占位符已替换</span>
        <button class="of-btn of-btn-sm" id="ae-pg-preview" style="margin-left:auto">生成预览</button>
        <button class="of-btn of-btn-ghost of-btn-sm" id="ae-pg-copy" disabled>复制</button>
      </div>
      <div class="of-hint" style="font-size:11px;margin-top:4px">读的是<b>已保存</b>的提示词与「战役·设置 → 正文取用」的规则；改完分段内容点一下别处（失焦即存）再生成即可。</div>
      <div id="ae-pg-preview-box" class="of-hint" style="margin-top:8px;font-size:12px">点「生成预览」查看数据AI 实际会收到的完整内容。</div>
    </div>

    <div id="ae-pg-group"></div>
  </div>`;

  const groupsEl = el.querySelector('#ae-pg-group') as HTMLElement;
  bindPreview(el, state);
  renderGroup(groupsEl, state);
}

/* ── 最终提示词预览 ── */
function bindPreview(el: HTMLElement, state: { flush: () => void }): void {
  const btn = el.querySelector('#ae-pg-preview') as HTMLButtonElement;
  const copyBtn = el.querySelector('#ae-pg-copy') as HTMLButtonElement;
  const box = el.querySelector('#ae-pg-preview-box') as HTMLElement;
  let 最近一次 = '';

  btn.addEventListener('click', () => {
    state.flush();                       // 先把提示词改动落盘，保证「预览 = 实发」
    const g = loadGame();
    if (!g) {
      box.innerHTML = '<b>尚未初始化存档</b>：先到「艾瑟兰战役」页初始化开局，再生成预览。';
      copyBtn.disabled = true; 最近一次 = '';
      return;
    }
    let ordered: { role: string; content: string }[] = [];
    try { ordered = 组装数据AI提示词(g); }
    catch (e) { box.innerHTML = '组装失败：' + esc((e as Error).message); copyBtn.disabled = true; 最近一次 = ''; return; }

    let total = 0;
    const parts = ordered.map((s, i) => {
      total += s.content.length;
      return `<div style="margin-bottom:10px">
        <div class="of-hint" style="font-size:11px;margin-bottom:2px">[${i + 1}/${ordered.length}] role=${s.role} · ${s.content.length} 字符</div>
        <pre style="white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.04);border:1px solid #313244;border-radius:6px;padding:8px;margin:0;font-size:12px;line-height:1.6;max-height:340px;overflow:auto">${esc(s.content)}</pre>
      </div>`;
    }).join('');
    最近一次 = ordered.map(s => s.content).join('\n\n');
    box.innerHTML = `<div class="of-hint" style="font-size:11px;margin-bottom:8px">共 ${ordered.length} 段 · 合计 ${total} 字符（≈ ${Math.round(total / 1.6)} tokens 中文估算）· 正文按当前「正文取用」设置（轮数 / 每轮上限 / 标签）取用</div>${parts}`;
    copyBtn.disabled = false;
  });

  copyBtn.addEventListener('click', () => {
    if (!最近一次) return;
    const clip = (globalThis as any).navigator?.clipboard;
    if (!clip?.writeText) { toastr?.warning?.('当前环境不支持自动复制，请手动选中文本复制'); return; }
    clip.writeText(最近一次).then(
      () => toastr?.success?.('已复制完整提示词'),
      () => toastr?.warning?.('复制失败，请手动选中文本复制'),
    );
  });
}

function renderGroup(root: HTMLElement, state: { flush: () => void }): void {
  const s = loadSettings();
  const segs = s.提示词[WHICH].map(x => ({ ...x }));
  const wrap = document.createElement('div');
  wrap.className = 'of-card';
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <div class="of-h2" style="margin:0">${WHICH} 提示词</div>
      <span class="of-hint" style="font-size:11px">逐轮读取正文 → 输出增量变更包</span>
      <span class="of-hint" style="font-size:11px">占位符：<code>{{状态}} {{正文}}</code>（脚本）｜酒馆宏 <code>{{user}}</code> 等亦可用</span>
    </div>
    <div class="ae-pg-segs" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="of-btn of-btn-ghost of-btn-sm ae-pg-add">＋ 添加一段</button>
      <button class="of-btn of-btn-ghost of-btn-sm ae-pg-preset">恢复默认</button>
    </div>`;
  root.appendChild(wrap);

  const segsEl = wrap.querySelector('.ae-pg-segs') as HTMLElement;

  function renderSegs() {
    segsEl.innerHTML = segs.map((seg, i) => `
      <div class="of-card" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <select class="of-select" data-role="${i}" style="width:100px">
            <option value="system" ${seg.role === 'system' ? 'selected' : ''}>system</option>
            <option value="user" ${seg.role === 'user' ? 'selected' : ''}>user</option>
            <option value="assistant" ${seg.role === 'assistant' ? 'selected' : ''}>assistant</option>
          </select>
          <input class="of-input" data-note="${i}" value="${(seg.note || '').replace(/"/g, '&quot;')}" placeholder="备注" style="flex:1">
          <button class="of-btn of-btn-ghost of-btn-sm" data-up="${i}" title="上移">↑</button>
          <button class="of-btn of-btn-ghost of-btn-sm" data-down="${i}" title="下移">↓</button>
          <button class="of-btn of-btn-sm ${seg.enabled ? 'of-btn-ok' : 'of-btn-ghost'}" data-toggle="${i}">${seg.enabled ? 'ON' : 'OFF'}</button>
          <button class="of-btn of-btn-danger of-btn-sm" data-delseg="${i}" title="删除">删</button>
        </div>
        <textarea class="of-textarea" data-content="${i}" rows="3">${(seg.content || '').replace(/</g, '&lt;')}</textarea>
      </div>
    `).join('');
  }
  renderSegs();

  function save() {
    const cur = loadSettings() as Settings;
    cur.提示词[WHICH] = segs.map(x => ({ ...x }));
    saveSettings(cur);
    toastr?.success?.(`已保存 ${WHICH} 提示词`);
  }
  state.flush = save;   // 供「生成预览」先把改动落盘

  segsEl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const up = t.closest('[data-up]'); const down = t.closest('[data-down]');
    const tog = t.closest('[data-toggle]'); const del = t.closest('[data-delseg]');
    if (up) { const i = parseInt(up.getAttribute('data-up')!, 10); if (i > 0) { [segs[i - 1], segs[i]] = [segs[i], segs[i - 1]]; save(); renderSegs(); } }
    if (down) { const i = parseInt(down.getAttribute('data-down')!, 10); if (i < segs.length - 1) { [segs[i + 1], segs[i]] = [segs[i], segs[i + 1]]; save(); renderSegs(); } }
    if (tog) { const i = parseInt(tog.getAttribute('data-toggle')!, 10); segs[i].enabled = !segs[i].enabled; save(); renderSegs(); }
    if (del) {
      const i = parseInt(del.getAttribute('data-delseg')!, 10);
      if (!confirm(`删除「${segs[i]?.note || segs[i]?.role || '这一段'}」？`)) return;
      segs.splice(i, 1); save(); renderSegs();
    }
  });
  segsEl.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    const roleSel = t.closest('[data-role]'); const noteInp = t.closest('[data-note]');
    if (roleSel) { segs[parseInt(roleSel.getAttribute('data-role')!, 10)].role = (roleSel as HTMLSelectElement).value as any; save(); }
    if (noteInp) { segs[parseInt(noteInp.getAttribute('data-note')!, 10)].note = (noteInp as HTMLInputElement).value; save(); }
  });
  segsEl.querySelectorAll('[data-content]').forEach(ta => {
    ta.addEventListener('blur', () => {
      const i = parseInt(ta.getAttribute('data-content')!, 10);
      segs[i].content = (ta as HTMLTextAreaElement).value;
      save();
    });
  });
  wrap.querySelector('.ae-pg-add')!.addEventListener('click', () => {
    segs.push({ role: 'system', content: '（新分段，占位符见页首说明）', enabled: true, note: '自定义' });
    save(); renderSegs();
  });
  wrap.querySelector('.ae-pg-preset')!.addEventListener('click', () => {
    if (!confirm(`恢复 ${WHICH} 提示词为默认？当前自定义会丢失。`)) return;
    segs.splice(0, segs.length, ...默认提示词()[WHICH].map(x => ({ ...x })));
    save(); renderSegs();
  });
}
