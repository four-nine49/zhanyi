// package-loader.mjs — 生成"酒馆助手脚本版"加载器 json（玉子手机脚本版同款机制）
//
// 扩展版和脚本版共用同一份 dist 产物，只是加载通道不同：
//   扩展版：manifest.json → 酒馆扩展管理器加载 dist/index.js + dist/index.css
//   脚本版：本脚本生成的 json 导入酒馆助手 → 加载器从 jsdelivr CDN 拉取同一 dist 产物
//           注入主页面（<link> + <script type="module">），每次加载自动取最新 tag = 自动更新
//
// ⚠️ 用前先改下面的 REPO_OWNER / REPO_NAME（发布到 GitHub、把 dist/ 提交并打 tag 后，
//    CDN 才拉得到产物；没发布时导入脚本版会触发 onerror 提示）。
//
// 机制对照 酒馆助手脚本-玉子手机.json / scripts/check-script-loader-contract.cjs：
//   1. root = window.parent ?? window（酒馆助手脚本跑在 iframe，主页面是 parent）
//   2. 查重：实例 key（bundle 在主页面 window 设 __OPENING_FRAMEWORK_INSTANCE__，与扩展版互斥）
//      + 旧痕迹元素 id；阻断时 alert"请勿同时启用扩展版和脚本版"
//   3. GitHub tags API 取最新 tag（空/异常回退 manifest.json 的版本）
//   4. fetch 前和 append 前各复检一次；注入元素 id 稳定，可重复执行
//   5. 不自动 destroy 旧实例、不顶层 return 逃逸
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// CDN 拉取的 GitHub 仓库（https://github.com/four-nine49/zhanyi）
const REPO_OWNER = 'four-nine49';
const REPO_NAME = 'zhanyi';

// 版本与 manifest.json 同步：tags API 拉不到时回退到 v(manifest.version)
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf8'));
const FALLBACK_VERSION = `v${manifest.version}`;

// 产物必须先构建（与扩展版同一份）
const distJs = resolve(__dirname, 'dist', 'index.js');
const distCss = resolve(__dirname, 'dist', 'index.css');
try {
  readFileSync(distJs, 'utf8');
  readFileSync(distCss, 'utf8');
} catch {
  console.error('[package-loader] dist 产物缺失，先运行 node build.mjs');
  process.exit(1);
}

// bundle 侧实例 key（src/index.ts 的 INSTANCE_KEY），两侧必须一致
const BUNDLE_KEY = '__OPENING_FRAMEWORK_INSTANCE__';

// 注入元素 id（稳定，重复执行幂等）；旧痕迹 = 本 loader 注入物 + 归档旧版注入物 + bundle DOM
const CSS_ID = 'of-css';
const JS_ID = 'of-js';
const LEGACY_TRACE_IDS = [
  'of-root',
  'of-window',
  'of-toggle',
  CSS_ID,
  JS_ID,
  'opening-framework-css', // 归档旧版引导加载器的注入 id
  'opening-framework-js',
];

const loader = `const root = window.parent ?? window;
const INSTANCE_KEY = '${BUNDLE_KEY}';
const LEGACY_TRACE_IDS = [
${LEGACY_TRACE_IDS.map(id => `  '${id}',`).join('\n')}
];

function getRootDocument() {
  return root?.document ?? document;
}

function findBlockingTraceId() {
  const doc = getRootDocument();
  if (!doc?.querySelector) return '';
  return LEGACY_TRACE_IDS.find(id => doc.querySelector('#' + id)) || '';
}

function getDuplicateLoadBlockReason() {
  return root?.[INSTANCE_KEY] ? INSTANCE_KEY : findBlockingTraceId();
}

function notifyDuplicateLoadBlocked(reason) {
  const message = '[开局框架] 检测到已加载实例或旧痕迹，已阻止重复加载';
  console.warn(message, reason);
  try {
    if (typeof root.alert === 'function') {
      root.alert('检测到开局框架已加载，请勿同时启用扩展版和脚本版。');
    }
  } catch {}
}

const initialBlockReason = getDuplicateLoadBlockReason();
if (initialBlockReason) {
  notifyDuplicateLoadBlocked(initialBlockReason);
} else {
  async function getLatestVersion() {
    try {
      const res = await fetch('https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags');
      const tags = await res.json();
      return tags[0]?.name || '${FALLBACK_VERSION}';
    } catch {
      return '${FALLBACK_VERSION}';
    }
  }

  const version = await getLatestVersion();
  const postFetchBlockReason = getDuplicateLoadBlockReason();
  if (postFetchBlockReason) {
    notifyDuplicateLoadBlocked(postFetchBlockReason);
  } else {
    const base = \`https://gcore.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@\${version}\`;

    if (!root.document.querySelector('#${CSS_ID}')) {
      const link = root.document.createElement('link');
      link.id = '${CSS_ID}';
      link.rel = 'stylesheet';
      link.href = \`\${base}/dist/index.css\`;
      root.document.head.appendChild(link);
    }

    if (!root.document.querySelector('#${JS_ID}')) {
      const script = root.document.createElement('script');
      script.id = '${JS_ID}';
      script.type = 'module';
      script.src = \`\${base}/dist/index.js\`;
      script.onerror = function () {
        script.remove(); // 失败残留会挡住重试注入，移除后重跑加载器即可重试
        console.error('[开局框架] 从 CDN 拉取 bundle 失败：', script.src);
        try { root.alert('开局框架加载失败：无法从 CDN 拉取 bundle。请检查仓库是否已发布（含 dist/）且打了 tag，以及网络。'); } catch {}
      };
      root.document.head.appendChild(script);
    }
  }
}`;

const script = {
  type: 'script',
  enabled: false, // 与玉子一致：导入后手动启用（避免与扩展版同时开启）
  name: '艾瑟兰战役（自动更新）',
  id: '10ba63e3-ad25-4c73-9754-3d94a59a3f43',
  content: loader,
  info: '艾瑟兰战役（酒馆助手脚本版）：与扩展版共用同一份 dist 产物，从 CDN 拉取并注入主页面，自动跟随最新 tag。请勿与扩展版同时启用。',
  button: { enabled: false, buttons: [] },
  data: {},
  export_with: { data: true, button: true },
};

const outDir = resolve(__dirname, 'releases');
mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, '酒馆助手脚本-战役.json');
writeFileSync(out, JSON.stringify(script, null, 2), 'utf8');

// ── 自检（对照玉子手机 check-script-loader-contract.cjs 的关键契约）──
const results = [];
const check = (description, ok, details = '') => results.push({ description, ok, details });

const raw = readFileSync(out, 'utf8');
let parsed = null;
try { parsed = JSON.parse(raw); check('JSON 可解析', true); }
catch (e) { check('JSON 可解析', false, e.message); }

try {
  new Function('window', 'document', 'fetch', `return (async()=>{${loader}\n})();`);
  check('loader 可作为异步脚本解析', true);
} catch (e) { check('loader 可作为异步脚本解析', false, e.message); }

const ordered = (...idx) => idx.every(i => i >= 0) && idx.every((v, i) => i === 0 || idx[i - 1] < v);
const pos = s => loader.indexOf(s);

check('fallback tag = v(manifest.version)', new RegExp(`'v\\d+\\.\\d+\\.\\d+'`).test(loader), FALLBACK_VERSION);
check('tags API 指向配置仓库', loader.includes(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags`));
check('tags 空结果回退 manifest tag', loader.includes(`return tags[0]?.name || '${FALLBACK_VERSION}';`));
check('tags 异常回退 manifest tag', loader.includes(`return '${FALLBACK_VERSION}';`));
check('jsDelivr base 使用动态 version tag', loader.includes(`https://gcore.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@$\{version}`));
check('注入 dist JS bundle', loader.includes('/dist/index.js'));
check('注入 dist CSS bundle', loader.includes('/dist/index.css'));
check('CSS 注入 id 稳定', loader.includes(`link.id = '${CSS_ID}';`));
check('JS 注入 id 稳定', loader.includes(`script.id = '${JS_ID}';`));
check('singleton key 与 bundle 一致', loader.includes(`'${BUNDLE_KEY}'`) && readFileSync(resolve(__dirname, 'src', 'index.ts'), 'utf8').includes(`'${BUNDLE_KEY}'`));
check('重复加载统一走阻断原因', loader.includes('function getDuplicateLoadBlockReason()'));
LEGACY_TRACE_IDS.forEach(id => check(`旧痕互斥检测包含 ${id}`, loader.includes(`'${id}'`)));
check('fetch 前和 append 前均复检重复加载', ordered(
  pos('const initialBlockReason = getDuplicateLoadBlockReason();'),
  pos(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags`),
  pos('const postFetchBlockReason = getDuplicateLoadBlockReason();'),
  pos('appendChild(link)'),
  pos('appendChild(script)'),
));
check('loader 不使用顶层 return 逃逸', !loader.includes('return;'));
check('loader 不自动 destroy 旧实例', !loader.includes('.destroy(') && !loader.includes('destroy?.('));

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'} ${r.description}${r.ok || !r.details ? '' : ' — ' + r.details}`);
}

if (failed.length > 0) {
  console.error(`\n[package-loader] ${failed.length} 项自检未通过`);
  process.exit(1);
}

console.log(`\n已生成 ${out}`);
console.log(`content 长度: ${loader.length} 字符 | CDN: https://gcore.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@<tag>`);
if (REPO_NAME === 'opening-framework') {
  console.log('⚠️ 仓库还是占位名：发布到 GitHub（含 dist/，打 tag）后改成实际 owner/repo 再重新生成。');
}
