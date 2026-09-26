// build.mjs — esbuild 打包：产出自包含扩展 bundle（SillyTavern manifest 注入主页面）
//
// 用法：node build.mjs            生产构建
//      node build.mjs --dev       开发构建（未压缩 + 内联 sourcemap）
//      node build.mjs --watch     监听变化自动重建
//
// 产物：
//   dist/index.js    主 bundle（ESM：ST 用 import() 加载扩展脚本，import.meta.url 可用）
//   dist/index.css   全部样式（从 src/ui/styles.ts 的 PANEL_CSS 提取，manifest 的 css 字段注入）

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = resolve(ROOT, 'src');
const OUTDIR = resolve(ROOT, 'dist');
const JS_OUT = resolve(OUTDIR, 'index.js');

// esbuild 解析：本目录 node_modules → 参考项目 node_modules（pnpm 布局）→ 报错提示安装
const REF_NM = resolve(ROOT, '..', '开局框架-扩展', 'node_modules');
async function loadEsbuild() {
  try {
    return await import('esbuild');
  } catch { /* 回落到参考项目 */ }
  const ref = resolve(REF_NM, '.pnpm', 'esbuild@0.24.0', 'node_modules', 'esbuild', 'lib', 'main.js');
  if (existsSync(ref)) return await import(pathToFileURL(ref).href);
  throw new Error('找不到 esbuild：请 pnpm install（本目录或 ../开局框架-扩展 均可）');
}

const esbuild = await loadEsbuild();
const CSS_OUT = resolve(OUTDIR, 'index.css');

const args = process.argv.slice(2);
const isDev = args.includes('--dev') || args.includes('--watch');
const isWatch = args.includes('--watch');

if (!isWatch && existsSync(OUTDIR)) rmSync(OUTDIR, { recursive: true, force: true });
mkdirSync(OUTDIR, { recursive: true });

// ?raw 导入 plugin（tables/standard.json 以文本打进 bundle）
const rawPlugin = {
  name: 'raw-loader',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const realPath = args.path.replace(/\?raw$/, '');
      return { path: resolve(dirname(args.importer), realPath), namespace: 'raw' };
    });
    build.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => {
      return { contents: readFileSync(args.path, 'utf8'), loader: 'text' };
    });
  },
};

const options = {
  entryPoints: [resolve(SRC, 'index.ts')],
  bundle: true,
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  target: ['es2022'],
  charset: 'utf8', // 保留中文原文（默认 ascii 会全部转 \uXXXX，产物可读性差且体积更大）
  // ESM：SillyTavern 以 import() 加载扩展 js；slash 命令模块也按相对 URL 动态 import
  format: 'esm',
  platform: 'browser',
  legalComments: 'none',
  outfile: JS_OUT,
  plugins: [rawPlugin],
  logLevel: 'info',
};

/** 从 ui/styles.ts 提取 PANEL_CSS 字符串，写成独立 css 文件（manifest css 字段指向它） */
function extractCss() {
  const stylesTs = readFileSync(resolve(SRC, 'ui', 'styles.ts'), 'utf8');
  const m = stylesTs.match(/export const PANEL_CSS = `([\s\S]*?)`;/);
  if (!m) {
    console.warn('[build] 未找到 PANEL_CSS，css 输出为空');
    writeFileSync(CSS_OUT, '', 'utf8');
    return;
  }
  writeFileSync(CSS_OUT, m[1], 'utf8');
  console.log(`[build] css 已导出 (${(m[1].length / 1024).toFixed(1)} KB)`);
}

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching for changes...');
    return;
  }
  const t0 = Date.now();
  await esbuild.build(options);
  extractCss();
  await emitHtml();
  const size = readFileSync(JS_OUT, 'utf8').length;
  console.log(`[build] done in ${Date.now() - t0}ms → dist/index.js (${(size / 1024).toFixed(1)} KB)`);
}

/** 产出独立的开局/状态栏 HTML 交付物（引擎已内联，可直接放进正则替换或手动打开） */
async function emitHtml() {
  const eng = resolve(__dirname, 'src', 'gradband', 'engine', 'circuit-engine.js');
  const assets = resolve(__dirname, 'src', 'gradband', 'assets');
  const engine = readFileSync(eng, 'utf8');
  const htmlTargets = {
    statusbar: '状态栏面板.html',
    opening: '开局界面.html',
    'statusbar-desk': '状态栏面板-双桌.html', // 双桌工作台（另存，不替换旧版）
    'statusbar-mobile': '状态栏面板-手机.html', // 手机简化版（v1.8.9；单列卡片流，配套 regex-状态栏-手机.json）
  };
  for (const [name, outName] of Object.entries(htmlTargets)) {
    const tpl = readFileSync(resolve(assets, `${name}.html`), 'utf8');
    const out = tpl.replace('/*@ENGINE@*/', () => engine);
    const file = resolve(OUTDIR, outName);
    writeFileSync(file, out, 'utf8');
    console.log(`[build] ${file} (${(out.length / 1024).toFixed(1)} KB)`);
  }

  // 艾瑟兰战役状态栏（毛坯版）：无引擎依赖，直接产出（配套 scripts/gen-aiselan-regex.mjs）
  const aeTpl = readFileSync(resolve(__dirname, 'src', 'aiselan', 'assets', 'aiselan-statusbar.html'), 'utf8');
  const aeFile = resolve(OUTDIR, '艾瑟兰状态栏.html');
  writeFileSync(aeFile, aeTpl, 'utf8');
  console.log(`[build] ${aeFile} (${(aeTpl.length / 1024).toFixed(1)} KB)`);

  // 艾瑟兰战役开局面板：注入 schema.ts 的「开局存档」默认档（单一事实来源）
  // 源文件写的是 `var 默认存档 = /*@DEFAULT_SAVE@*/ null;`——未替换时（直接开源文件）退化为 null 仍合法；
  // 构建时连同 " null" 一起替换，避免残留成 `{...} null` 语法错误。
  const 默认存档 = await loadDefaultSave();
  const aoTpl = readFileSync(resolve(__dirname, 'src', 'aiselan', 'assets', 'aiselan-opening.html'), 'utf8');
  const aoOut = aoTpl.replace('/*@DEFAULT_SAVE@*/ null', () => JSON.stringify(默认存档));
  if (aoOut.includes('@DEFAULT_SAVE@')) throw new Error('开局面板模板占位符替换失败（检查源文件写法）');
  const aoFile = resolve(OUTDIR, '艾瑟兰开局.html');
  writeFileSync(aoFile, aoOut, 'utf8');
  console.log(`[build] ${aoFile} (${(aoOut.length / 1024).toFixed(1)} KB)`);
}

/** 从 src/aiselan/core/schema.ts 打包出「开局存档」默认档（注入开局面板 HTML） */
async function loadDefaultSave() {
  const { outputFiles } = await esbuild.build({
    entryPoints: [resolve(SRC, 'aiselan', 'core', 'schema.ts')],
    bundle: true, format: 'esm', platform: 'node', write: false, charset: 'utf8', logLevel: 'silent',
  });
  const tmp = resolve(OUTDIR, '.schema.tmp.mjs');
  writeFileSync(tmp, outputFiles[0].text, 'utf8');
  try {
    const mod = await import(pathToFileURL(tmp).href);
    return mod.开局存档 ?? null;
  } finally {
    rmSync(tmp, { force: true });
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
