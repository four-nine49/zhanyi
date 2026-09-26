// core/settings.ts — 扩展设置持久化（指南 五）
//
// 全部设置存 getContext().extensionSettings[EXTENSION_NAME]，由酒馆自动持久化到 settings.json：
//   - 窗口/悬浮窗 UI 偏好（位置、尺寸、是否显示悬浮按钮）
//   - 业务设置（填表 API、全局默认、提示词模板、自动填表开关）
// 写入后调用 ctx.saveSettingsDebounced() 触发酒馆防抖保存。
// 读取时用 zod 校验 + 兜底默认值，防止脏数据导致崩溃（指南 5.3）。
import { z } from 'zod';

import { getContext } from './context';
import { FillApiConfig, DialogueApiConfig, GlobalDefaults, PromptTemplate } from '../store/types';
import { DEFAULT_PROMPT_TEMPLATE } from '../store/prompt-defaults';
import { DEFAULT_ACTIVE_PACKAGE_ID } from '../dialogue/rule-package';

export const EXTENSION_NAME = 'opening-framework';

export const OfSettingsSchema = z.object({
  // ── 窗口 UI ──
  windowX: z.number().nullable().default(null),
  windowY: z.number().nullable().default(null),
  windowWidth: z.number().min(280).max(4096).default(420),
  windowHeight: z.number().min(320).max(4096).default(660),
  // ── 悬浮按钮 UI ──
  floatingToggleEnabled: z.boolean().default(true),
  toggleX: z.number().nullable().default(null),
  toggleY: z.number().nullable().default(null),
  toggleSize: z.number().min(32).max(72).default(44),
  // ── 业务：调度 ──
  autoFillEnabled: z.boolean().default(true),  // 启用标准表格（自动填表）：关掉后标准表不再自动填表（与渐变带数据AI/法术AI 无关）
  maxRetries: z.number().int().min(0).max(5).default(1),
  // ── 业务：嵌套对象（缺失或损坏时整体回落默认值）──
  fillApi: FillApiConfig.catch(FillApiConfig.parse({})),
  dialogueApi: DialogueApiConfig.catch(DialogueApiConfig.parse({})),
  globalDefaults: GlobalDefaults.catch(GlobalDefaults.parse({})),
  promptTemplate: PromptTemplate.catch(DEFAULT_PROMPT_TEMPLATE),
  // ── 规则包 ──
  activeRulePackageId: z.string().catch(DEFAULT_ACTIVE_PACKAGE_ID).default(DEFAULT_ACTIVE_PACKAGE_ID),
  // 用户导入的规则包（原始对象数组；读取时逐个 safeParse，坏包跳过不污染其它包）
  rulePackages: z.array(z.unknown()).catch([]),
  // ── 数据同步 ──
  autoSyncEnabled: z.boolean().default(true),  // 收到 AI 回复 / 填表完成后自动同步到楼层变量（默认开）
  statusPlaceholderEnabled: z.boolean().default(true), // AI 回复末尾追加 <StatusPlaceHolderImpl/>（状态栏锚点，默认开）
  // ── 模式（剑与汽水 / 渐变带 / 艾瑟兰战役）：侧栏按模式过滤显示 ──
  appMode: z.enum(['presets', 'gradband', 'aiselan']).default('presets'),
});

export type OfSettings = z.infer<typeof OfSettingsSchema>;

/** 读取命名空间原始对象（无副作用，不存在返回 {}） */
function readNamespace(): Record<string, unknown> {
  const ctx = getContext();
  const raw = ctx?.extensionSettings?.[EXTENSION_NAME];
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** 读取设置（zod 校验 + 默认兜底；返回的是副本，写回请用 saveSetting / saveSettingsPatch） */
export function loadSettings(): OfSettings {
  try {
    const parsed = OfSettingsSchema.safeParse(readNamespace());
    if (parsed.success) return parsed.data;
    console.warn('[开局框架] 设置校验失败，使用默认值：', parsed.error.message);
    return OfSettingsSchema.parse({});
  } catch (e) {
    console.error('[开局框架] loadSettings 异常：', e);
    return OfSettingsSchema.parse({});
  }
}

/** 写单个键（指南 5.2：改 extensionSettings + saveSettingsDebounced） */
export function saveSetting(key: string, value: unknown): void {
  const ctx = getContext();
  if (!ctx?.extensionSettings) {
    console.warn('[开局框架] extensionSettings 不可用，设置未持久化');
    return;
  }
  if (!ctx.extensionSettings[EXTENSION_NAME] || typeof ctx.extensionSettings[EXTENSION_NAME] !== 'object') {
    ctx.extensionSettings[EXTENSION_NAME] = {};
  }
  ctx.extensionSettings[EXTENSION_NAME][key] = value;
  if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
}

/** 批量写多个键 */
export function saveSettingsPatch(patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) saveSetting(k, v);
}
