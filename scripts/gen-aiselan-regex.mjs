// scripts/gen-aiselan-regex.mjs — 生成 json/regex-艾瑟兰状态栏.json 与 json/regex-艾瑟兰开局.json
//
// 用 dist 的 HTML 作为 replaceString，产出可导入酒馆正则的 JSON 包。
// 用法：node build.mjs && node scripts/gen-aiselan-regex.mjs
// 注意：固定 UUID，重复生成不会导致酒馆里出现重复条目。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/** 固定 id：改这里等于换一条新正则（旧条目需手动删） */
const STATEBAR_RE_ID = 'a3f1c2d4-7b6e-4a90-9c15-2e8f0b4d6a71';
const OPENING_RE_ID = 'b7e2d9a1-4c58-4f37-8a26-9d5b1e7c3f02';

const targets = [
  {
    name: '状态栏',
    html: resolve(ROOT, 'dist', '艾瑟兰状态栏.html'),
    out: resolve(ROOT, 'json', 'regex-艾瑟兰状态栏.json'),
    id: STATEBAR_RE_ID,
    scriptName: '状态栏（艾瑟兰战役·毛坯版）',
    marker: '<StatusPlaceHolderImpl/>',
  },
  {
    name: '开局',
    html: resolve(ROOT, 'dist', '艾瑟兰开局.html'),
    out: resolve(ROOT, 'json', 'regex-艾瑟兰开局.json'),
    id: OPENING_RE_ID,
    scriptName: '开局（艾瑟兰战役·毛坯版）',
    marker: '<艾瑟兰开局/>',
  },
];

let 失败 = 0;
for (const t of targets) {
  if (!existsSync(t.html)) {
    console.error(`找不到 ${t.html} —— 先跑 node build.mjs`);
    失败++;
    continue;
  }
  const html = readFileSync(t.html, 'utf8');
  const pkg = [
    {
      id: t.id,
      scriptName: t.scriptName,
      findRegex: t.marker,
      replaceString: html,
      trimStrings: [],
      placement: [2],
      disabled: false,
      markdownOnly: true,
      promptOnly: false,
      runOnEdit: true,
      substituteRegex: 0,
      minDepth: 0,
      maxDepth: 0,
    },
  ];
  writeFileSync(t.out, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[regex] ${t.out} (${(JSON.stringify(pkg).length / 1024).toFixed(1)} KB) 查找标记：${t.marker}`);
}
if (失败) process.exit(1);
