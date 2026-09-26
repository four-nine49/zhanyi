// ui/pages/aiselan-prompts.ts — 艾瑟兰战役 提示词编辑页（数据AI 一套）
//
// 交互与渐变带提示词页一致：ON/OFF、↑↓、删除、新增、恢复默认。占位符：{{状态}} {{正文}}
import { loadSettings, saveSettings, 默认提示词, type Settings } from '../../aiselan/core/settings';

const WHICH = '数据AI' as const;

export function renderAiselanPromptsPage(el: HTMLElement): void {
  el.innerHTML = `<div style="padding:16px">
    <div class="of-h1">艾瑟兰战役 · 提示词</div>
    <div class="of-hint" style="margin-bottom:12px">数据AI 一套（读正文 → 输出增量变更包）。<b>ON/OFF</b> 控制这段发不发，↑↓ 调顺序，可删可加、可恢复默认。</div>
    <div id="ae-pg-group"></div>
  </div>`;

  const groupsEl = el.querySelector('#ae-pg-group') as HTMLElement;
  renderGroup(groupsEl);
}

function renderGroup(root: HTMLElement): void {
  const s = loadSettings();
  const segs = s.提示词[WHICH].map(x => ({ ...x }));
  const wrap = document.createElement('div');
  wrap.className = 'of-card';
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <div class="of-h2" style="margin:0">${WHICH} 提示词</div>
      <span class="of-hint" style="font-size:11px">逐轮读取正文 → 输出增量变更包</span>
      <span class="of-hint" style="font-size:11px">占位符：<code>{{状态}} {{正文}}</code></span>
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
