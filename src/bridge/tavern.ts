// bridge/tavern.ts — 扩展环境（酒馆主页面）的 TavernHelper / SillyTavern API 桥
//
// 扩展由 manifest 注入主页面，可用：
//   window.TavernHelper（酒馆助手插件注入主页面全局：变量/消息/生成等）
//   window.SillyTavern.getContext()（酒馆原生上下文）
//   window.eventSource（酒馆原生事件系统）
// 这里封装开局框架用到的操作；TavernHelper 缺失时部分功能降级（原生 fallback）。

// ──────────────────────────────────────────────
// 类型
// ──────────────────────────────────────────────

/** 楼层消息（getChatMessages 返回；兼容酒馆原生 chat 数组的降级映射） */
export interface ChatMessage {
  message_id: number;
  name?: string;
  role: 'system' | 'user' | 'assistant';
  is_user: boolean;
  is_hidden?: boolean;
  message: string;
}

// ──────────────────────────────────────────────
// 内部：获取 TavernHelper 对象
// ──────────────────────────────────────────────

let cachedHelper: any = null;

function getHelper(): any {
  if (cachedHelper) return cachedHelper;
  try {
    if (typeof window !== 'undefined' && (window as any).TavernHelper) {
      cachedHelper = (window as any).TavernHelper;
      return cachedHelper;
    }
    const st = (window as any).SillyTavern;
    if (st && typeof st.getContext === 'function') {
      const ctx = st.getContext();
      if (ctx && ctx.TavernHelper) { cachedHelper = ctx.TavernHelper; return cachedHelper; }
    }
  } catch (e) { console.error('[开局框架] 获取 TavernHelper 失败', e); }
  return null;
}

export function bridgeAvailable(): boolean {
  return !!getHelper();
}

// ──────────────────────────────────────────────
// 扩展主页面专用的 extensionSettings 存取（en env=主页面，走 SillyTavern 上下文）
// ──────────────────────────────────────────────

/** 读 extensionSettings 命名空间（不存在/异常返回 fallback；不抛） */
export function readExtensionSettings<T>(key: string, fallback: T): T {
  try {
    const ctx = SillyTavern?.getContext?.();
    const ext = ctx?.extensionSettings;
    if (!ext) return fallback;
    const raw = ext[key];
    return (raw === undefined || raw === null) ? fallback : (raw as T);
  } catch { return fallback; }
}

/** 写 extensionSettings 命名空间（saveSettingsDebounced 防抖落盘） */
export function writeExtensionSettings(key: string, value: unknown): void {
  try {
    const ctx = SillyTavern?.getContext?.();
    if (!ctx?.extensionSettings) return;
    ctx.extensionSettings[key] = value;
    if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
  } catch { /* 忽略 */ }
}

/** ST 宏替换（{{user}} 等）；拿不到替换函数时原样返回 */
export function substituteParams(text: string): string {
  if (!text || !text.includes('{{')) return text;
  try {
    const ctx = SillyTavern?.getContext?.();
    const fn = ctx?.substituteParams;
    if (typeof fn === 'function') return fn.call(ctx, text);
  } catch { /* 忽略 */ }
  return text;
}

// ──────────────────────────────────────────────
/** 从 helper 取方法（找不到返回 null） */
function method<T = any>(name: string): T | null {
  const h = getHelper();
  if (!h) return null;
  const fn = h[name];
  return typeof fn === 'function' ? (fn as T) : null;
}

/** 调用 TavernHelper 的方法（含异步），不可用时返回 null；调用异常也会回落为 null */
export function tavernHelperCall<T = any>(name: string, ...args: any[]): Promise<T> | null {
  const fn = method<(...a: any[]) => any>(name);
  if (!fn) return null;
  try {
    return Promise.resolve(fn(...args)) as Promise<T>;
  } catch (e) {
    console.warn(`[开局框架] TavernHelper.${name} 调用失败：`, e);
    return null;
  }
}

/** 调用 TavernHelper 的同步方法，不可用时返回 null */
export function tavernHelperCallSync<T = any>(name: string, ...args: any[]): T | null {
  const fn = method<(...a: any[]) => any>(name);
  if (!fn) return null;
  try {
    return fn(...args) as T;
  } catch (e) {
    console.warn(`[开局框架] TavernHelper.${name} 调用失败：`, e);
    return null;
  }
}

// ──────────────────────────────────────────────
// 变量操作（chat 变量：表格存储 / 对话状态）
// ──────────────────────────────────────────────

/** getVariables({type}) — 返回变量表 */
export function getVariables(option: { type: string; [k: string]: any }): Record<string, any> {
  const fn = method<(o: any) => Record<string, any>>('getVariables');
  if (fn) { try { return fn(option) ?? {}; } catch { return {}; } }
  console.error('[开局框架] getVariables 不可用（TavernHelper 未注入主页面？）');
  return {};
}

/** updateVariablesWith(updater, {type}) — 函数式更新变量表 */
export function updateVariablesWith(
  updater: (v: Record<string, any>) => Record<string, any> | Promise<Record<string, any>>,
  option: { type: string; [k: string]: any },
): void {
  const fn = method<(u: any, o: any) => any>('updateVariablesWith');
  if (fn) { try { void fn(updater, option); } catch (e) { console.error('[开局框架] updateVariablesWith 失败', e); } return; }
  // 兜底：用 replaceVariables
  const rv = method<(v: Record<string, any>, o: any) => void>('replaceVariables');
  if (rv) {
    const cur = getVariables(option);
    const next = updater(cur) || cur; // 同步 updater
    try { rv(next, option); } catch (e) { console.error('[开局框架] replaceVariables 失败', e); }
  }
}

// ──────────────────────────────────────────────
// 消息（楼层）操作
// ──────────────────────────────────────────────

/**
 * 归一化一条楼层消息。
 *
 * ⚠️ 关键：TavernHelper 的 `getChatMessages` 返回的 ChatMessage **没有 `is_user` 字段**（只有 `role`），
 * 而 SillyTavern 原生 `chat[]` 才有 `is_user`。本扩展下游（取正文分层【玩家】/【AI】、填表取轮、
 * 状态栏标记补楼、对话页渲染）**一律按 `m.is_user` 判定**，所以这里必须把 `is_user` 补出来，
 * 否则用户消息会被当成 AI 消息（表现为：正文里用户的话也标成【AI】、填表轮数失效）。
 *
 * 兼容两种情况：给了 `is_user` 就用它；只给 `role` 就按 `role === 'user'` 推。
 */
function normalizeMessage(m: any, fallbackId: number): ChatMessage {
  const role = m?.role;
  const isUser = m?.is_user === true || role === 'user';
  return {
    ...(m && typeof m === 'object' ? m : {}),
    message_id: typeof m?.message_id === 'number' ? m.message_id : fallbackId,
    name: m?.name ?? '',
    role: (role === 'system' || role === 'user' || role === 'assistant') ? role : (isUser ? 'user' : 'assistant'),
    is_user: isUser,
    is_hidden: !!m?.is_hidden,
    message: String(m?.message ?? m?.mes ?? ''),
  } as ChatMessage;
}

export function getChatMessages(range: string | number, option?: any): ChatMessage[] {
  const fn = method<(r: any, o?: any) => any[]>('getChatMessages');
  if (fn) {
    try {
      const raw = (fn(range, option) ?? []) as any[];
      return raw.map((m, i) => normalizeMessage(m, i));
    } catch (e) { console.error('[开局框架] getChatMessages 失败', e); return []; }
  }
  try {
    // SillyTavern 原生 fallback：chat 数组
    const st = (window as any).SillyTavern;
    if (st && Array.isArray(st.chat)) {
      return st.chat.map((m: any, i: number) => normalizeMessage({ ...m, message_id: i, message: m.mes }, i)) as ChatMessage[];
    }
  } catch { /* 忽略 */ }
  console.error('[开局框架] getChatMessages 不可用');
  return [];
}

export async function createChatMessages(msg: any[], option?: any): Promise<void> {
  const fn = method<(m: any, o?: any) => Promise<any> | any>('createChatMessages');
  if (fn) { try { return await fn(msg, option); } catch (e) { console.error('[开局框架] createChatMessages 失败', e); return; } }
  try {
    // SillyTavern 原生 fallback
    const ctx = SillyTavern?.getContext?.();
    const addOne = ctx?.addOneMessage;
    if (addOne) { for (const m of msg) await addOne(m); }
  } catch { /* 忽略 */ }
}

export async function deleteChatMessages(ids: number[], option?: any): Promise<void> {
  const fn = method<(i: number[], o?: any) => Promise<any> | any>('deleteChatMessages');
  if (fn) { try { return await fn(ids, option); } catch (e) { console.error('[开局框架] deleteChatMessages 失败', e); return; } }
}

/** setChatMessages — 修改已有楼层（option.refresh: 'affected' 只刷新受影响楼层） */
export async function setChatMessages(msgs: any[], option?: any): Promise<void> {
  const fn = method<(m: any, o?: any) => Promise<any> | any>('setChatMessages');
  if (fn) { try { return await fn(msgs, option); } catch (e) { console.error('[开局框架] setChatMessages 失败', e); return; } }
  console.error('[开局框架] setChatMessages 不可用（TavernHelper 未注入？）');
}

export function triggerSlash(cmd: string): void {
  const fn = method<(c: string) => any>('triggerSlash');
  if (fn) { try { fn(cmd); } catch (e) { console.error('[开局框架] triggerSlash 失败', e); } }
}

/** getLastMessageId — 最新楼层 id（TavernHelper 缺失时回落：聊天长度-1） */
export function getLastMessageId(): number {
  const fn = method<() => number>('getLastMessageId');
  if (fn) {
    try {
      const id = fn();
      if (typeof id === 'number' && id >= -1) return id;
    } catch { /* 回落 */ }
  }
  try {
    return getChatMessages('0-{{lastMessageId}}').length - 1;
  } catch { /* 忽略 */ }
  return -1;
}

// ──────────────────────────────────────────────
// 生成
// ──────────────────────────────────────────────

export async function generateRaw(config: any): Promise<any> {
  const fn = method<(c: any) => Promise<any>>('generateRaw');
  if (!fn) { console.error('[开局框架] generateRaw 不可用'); throw new Error('generateRaw 不可用（TavernHelper 未注入）'); }
  return fn(config);
}

export function stopGenerationById(id: string): boolean {
  const fn = method<(i: string) => boolean>('stopGenerationById');
  if (fn) { try { return fn(id); } catch { return false; } }
  return false;
}

// ──────────────────────────────────────────────
// 事件（酒馆原生 eventSource）
// ──────────────────────────────────────────────

export const tavern_events = {
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_UPDATED: 'message_updated',
  MESSAGE_SWIPED: 'message_swiped',
  CHAT_CHANGED: 'chat_id_changed',
  MESSAGE_SENT: 'message_sent',
  GENERATION_ENDED: 'generation_ended',
};

function getEventSource(): any {
  try {
    if (typeof window !== 'undefined' && (window as any).eventSource) return (window as any).eventSource;
    const st = (window as any).SillyTavern;
    if (st && typeof st.getContext === 'function') {
      const c = st.getContext();
      if (c && c.eventSource) return c.eventSource;
    }
  } catch { /* 忽略 */ }
  return null;
}

export interface EventUnsub { stop: () => void }

/** eventOn — 监听酒馆原生事件，返回 {stop}（回调异常内部消化，不影响其他订阅者） */
export function eventOn(eventType: string, listener: (...args: any[]) => void): EventUnsub {
  const es = getEventSource();
  if (es && typeof es.on === 'function') {
    const wrapper = (...args: any[]) => {
      try { listener(...args); } catch (e) { console.error('[开局框架] 事件回调出错', e); }
    };
    es.on(eventType, wrapper);
    return { stop: () => { try { es.removeListener?.(eventType, wrapper); } catch { /* 忽略 */ } } };
  }
  console.error('[开局框架] eventSource 不可用，无法监听 ' + eventType);
  return { stop: () => {} };
}

// ──────────────────────────────────────────────
// 流式生成事件（酒馆助手 iframe_events 系列）
// ──────────────────────────────────────────────

/** 解析流式"当前完整文本"事件名（TavernHelper 常量缺失时用字面量兜底） */
function streamFullyEventName(): string {
  try {
    const h = getHelper();
    if (h?.iframe_events?.STREAM_TOKEN_RECEIVED_FULLY) return String(h.iframe_events.STREAM_TOKEN_RECEIVED_FULLY);
    if ((window as any).iframe_events?.STREAM_TOKEN_RECEIVED_FULLY) return String((window as any).iframe_events.STREAM_TOKEN_RECEIVED_FULLY);
  } catch { /* 忽略 */ }
  return 'js_stream_token_received_fully';
}

/**
 * 订阅流式生成的"当前完整文本"（js_stream_token_received_fully）。
 * 事件签名 (full_text, generation_id)；按 generationId 过滤，收到的回调只带 full_text。
 */
export function onStreamFullText(generationId: string, cb: (fullText: string) => void): EventUnsub {
  const eventType = streamFullyEventName();
  const wrapper = (...args: any[]) => {
    const text = typeof args[0] === 'string' ? args[0] : '';
    const gid = typeof args[1] === 'string' ? args[1] : undefined;
    if (gid && generationId && gid !== generationId) return; // 别的生成请求的 token
    try { cb(text); } catch (e) { console.error('[开局框架] 流式回调出错', e); }
  };
  // 优先走酒馆助手的事件系统（js_ 事件由它发出）
  const on = method<(t: string, l: (...args: any[]) => any) => any>('eventOn');
  if (on) {
    try {
      const ret = on(eventType, wrapper);
      const stopFn = () => {
        try { ret?.stop?.(); } catch { /* 忽略 */ }
        try { method<(t: string, l: (...args: any[]) => void) => void>('eventRemoveListener')?.(eventType, wrapper); } catch { /* 忽略 */ }
      };
      return { stop: stopFn };
    } catch { /* 回落到原生 eventSource */ }
  }
  return eventOn(eventType, wrapper);
}
