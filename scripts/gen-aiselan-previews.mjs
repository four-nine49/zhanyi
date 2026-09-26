// scripts/gen-aiselan-previews.mjs — 生成可直接双击打开的本地预览页（状态栏 + 开局）
//
// 读 dist 的 HTML，注入"酒馆环境桩"，输出到 美术预览/。
// 开局预览页额外带「预览日志」区域：确认开局时把将写入的内容显示出来。
// 用法：node build.mjs && node scripts/gen-aiselan-previews.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sample } from './aiselan-sample.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');
const OUT_DIR = resolve(ROOT, '美术预览');

function 读(name) {
  const p = resolve(DIST, name);
  if (!existsSync(p)) { console.error(`找不到 ${p} —— 先跑 node build.mjs`); process.exit(1); }
  return readFileSync(p, 'utf8');
}
function 注入(srcHtml, stub) {
  const idx = srcHtml.lastIndexOf('<script>');
  if (idx < 0) { console.error('HTML 里找不到 <script>'); process.exit(1); }
  return srcHtml.slice(0, idx) + stub + srcHtml.slice(idx);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

/* ── ① 状态栏预览 ── */
{
  const html = 读('艾瑟兰状态栏.html');
  const stub = `
<script>
/* ── 本地预览桩（仅预览文件使用；酒馆内由 TavernHelper 提供同名接口） ── */
window.__AI_PREVIEW__ = true;
var __SAMPLE__ = ${JSON.stringify(sample)};
function getVariables(o) {
  if (!o) return {};
  var g = window.__PREVIEW_GAME__ || __SAMPLE__;
  if (o.type === 'message') return { stat_data: { 艾瑟兰: g } };
  if (o.type === 'chat') return { 艾瑟兰: g };
  return {};
}
function getCurrentMessageId() { return 0; }
function getLastMessageId() { return 0; }
/* 装备穿脱演示用：把写入动作显示到页面右上角，并把改动写回内存存档，便于连续点击 */
window.__PREVIEW_GAME__ = JSON.parse(JSON.stringify(__SAMPLE__));
function updateVariablesWith(fn, opts) {
  try {
    if (opts && opts.type === 'chat') {
      var v = {}; v['艾瑟兰'] = window.__PREVIEW_GAME__;
      v = fn(v) || v;
      window.__PREVIEW_GAME__ = v['艾瑟兰'];
      var gg = window.__PREVIEW_GAME__;
      __LOG__('【写入存档】主角装备 → ' + JSON.stringify(gg['主角']['装备'])
        + (gg['生物'] && gg['生物']['爱丽丝'] ? '　爱丽丝装备 → ' + JSON.stringify(gg['生物']['爱丽丝']['装备']) : ''));
    } else if (opts && opts.type === 'message') {
      window.__PREVIEW_GAME__ = window.__PREVIEW_GAME__;
    }
  } catch (e) { __LOG__('写入异常：' + e); }
  return Promise.resolve();
}
function __LOG__(m) {
  var d = document.getElementById('__preview_log');
  if (d) d.textContent += m + '\\n';
}
</script>
<style>
#__preview_log{position:fixed;left:8px;top:8px;max-width:360px;max-height:40vh;overflow:auto;
  background:#0b0f14;border:1px solid #3a4352;border-radius:6px;padding:8px;font:12px/1.6 Consolas,monospace;
  color:#9ecbff;white-space:pre-wrap;z-index:9999;}
</style>
<pre id="__preview_log">— 预览日志（点「装备/卸下」后这里显示写入内容） —
</pre>
`;
  const out = 注入(html, stub);
  const f = resolve(OUT_DIR, '艾瑟兰状态栏预览.html');
  writeFileSync(f, out, 'utf8');
  console.log(`[preview] ${f}`);
}

/* ── ② 开局预览（带写入日志桩） ── */
{
  const html = 读('艾瑟兰开局.html');
  const stub = `
<script>
/* ── 本地预览桩：把"写入"动作显示到页面右下日志区 ── */
window.__AI_PREVIEW__ = true;
function __LOG__(m) {
  var d = document.getElementById('__preview_log');
  if (d) d.textContent += m + '\\n';
}
function getVariables(o) { return {}; }          /* 预览：视为未开局 */
function getLastMessageId() { return 0; }
function updateVariablesWith(fn, opts) {
  try {
    if (opts && opts.type === 'chat') {
      var v = {}; v = fn(v) || v;
      __LOG__('【chat 变量写入】艾瑟兰 = ' + JSON.stringify(v['艾瑟兰']).slice(0, 300) + ' …');
    } else if (opts && opts.type === 'message') {
      __LOG__('【楼层 ' + opts.message_id + ' 变量写入】stat_data.艾瑟兰（快照，已剥累计分钟）');
    } else {
      __LOG__('【变量写入】' + JSON.stringify(opts));
    }
  } catch (e) { __LOG__('写入异常：' + e); }
  return Promise.resolve();
}
function setChatMessages(arr) {
  try { __LOG__('【第 ' + arr[0].message_id + ' 楼文本写入】' + String(arr[0].message).slice(0, 100) + ' …'); } catch (e) {}
  return Promise.resolve();
}
</script>
<style>
#__preview_log{position:fixed;right:8px;bottom:8px;max-width:420px;max-height:46vh;overflow:auto;
  background:#0b0f14;border:1px solid #3a4352;border-radius:6px;padding:8px;font:12px/1.6 Consolas,monospace;
  color:#9ecbff;white-space:pre-wrap;z-index:9999;}
</style>
<pre id="__preview_log">— 预览日志（确认开局后显示将写入的内容） —\n</pre>
`;
  const out = 注入(html, stub);
  const f = resolve(OUT_DIR, '艾瑟兰开局预览.html');
  writeFileSync(f, out, 'utf8');
  console.log(`[preview] ${f}`);
}

/* 旧的单页预览生成物清理（若存在） */
rmSync(resolve(OUT_DIR, 'aiselan-statusbar-preview.html'), { force: true });
