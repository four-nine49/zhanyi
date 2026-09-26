# AGENTS.md — 战役/渐变带/剑与汽水 三模式扩展 · AI 总介绍

> 本文档写给**修改本扩展的 AI 编程助手**，是接手时的第一份文档（总览 + 规矩）。
> 人类用户看 `README.md`；引擎公式/状态栏契约/世界书参考/提示词契约等**技术细节**看
> `docs/具体介绍.md`（按部分查，不必通读）。
> 改完任何代码后必须跑：`node build.mjs` → `tsc --noEmit` → `node smoke.mjs`（见 §11）。
>
> ⚠️ **2026-09-26 起新增第 3 模式「艾瑟兰战役」**（`src/aiselan/`，仓库 four-nine49/zhanyi，版本 1.0.0）：
> 存档 zod schema / 纯函数引擎 / 增量变更包契约 / 回合调度 / 状态栏与开局面板（毛坯版）/
> 两条正则包（`regex-艾瑟兰状态栏.json`、`regex-艾瑟兰开局.json`）/ 自测脚本。
> **改编总览与实施进度看仓库根目录的 `改编说明.md`**；本文其余部分描述「渐变带·自由回路」与
> 「剑与汽水/开局框架」两条既有业务线，对战役模式同样成立的通用规矩（工程约束、构建链）沿用。

---

## 0. 运行时形态（先搞清页面上有什么在跑）

- **一套源码、一份 dist、两条加载通道**：扩展版（manifest 注入 dist/index.js+css）与脚本版
  （`releases/酒馆助手脚本-战役.json` 引导器从 jsDelivr 按最新 tag 拉同一份 dist）。运行时互斥
  （bundle 在主页面 window 设实例 key，脚本版加载器检测到即阻断）。
- **游玩时页面上有三个活物**，靠**酒馆聊天变量**通信：
  1. **扩展 bundle（常驻后台）**——不只是悬浮窗那张脸：监听 MESSAGE_RECEIVED、跑回合管线、
     调数据AI/法术AI、结算落盘。引擎随 bundle 加载后挂到全局 `window.CircuitEngine`（简称 E）。
  2. **开局面板 HTML**（`dist/开局界面.html`，正则替换 `<渐变带开局/>` 注入）——建档用。
  3. **状态栏 HTML**（`dist/状态栏面板-双桌.html`，正则替换 `<StatusPlaceHolderImpl/>` 注入，
     旧六页版 `状态栏面板.html` 并存但不是主目标）——独立小脚本，读写酒馆变量、借用全局引擎 E。
- **HTML 面板不自动更新**：bundle 自动跟新 tag；两个 HTML 内嵌在用户导入的正则里，
  改了 HTML 必须 `node build.mjs` 重新生成 dist，且用户要**重新导入正则**。

---

## 1. 目录地图（改哪里）

```
src/
├── index.ts               # 入口：singleton → 悬浮球保底挂载 → 窗口/面板/命令/事件
├── core/                  # 基础设施（无业务逻辑）
│   ├── version.ts         # ★ 版本号唯一来源（工具页显示用）；manifest/package.json 需同步手改
│   ├── context.ts         # getContext()（SillyTavern 上下文）
│   ├── settings.ts        # extensionSettings 读写 + OfSettingsSchema（全部设置项的 zod 定义）★
│   ├── event-manager.ts   # DOM/事件监听统一登记销毁
│   ├── geometry.ts        # clamp / constrainPosition
│   └── slash.ts           # /opening 命令（动态 import 酒馆核心，失败降级）
├── window/
│   ├── window.ts          # 窗口容器（拖拽/缩放/开关）；手机≤640px 由 CSS 强制近全屏
│   └── toggle.ts          # 🎬 悬浮球（唯一入口；拖拽/点击 5px+300ms 区分；保底自检见 index）
├── bridge/tavern.ts       # ★ TavernHelper / SillyTavern API 唯一封装层
│                          #   规则：任何 ST/TH API 调用必须走这里；新 API 在此加薄封装
├── schedule/trigger.ts    # 填表调度：MESSAGE_RECEIVED 计数→按生效频率/跳楼分组→runFill（防重入）
├── store/                 # 数据层
│   ├── types.ts           # ★★ 全部 zod schema：UpdateConfig(a 档)/Sheet/TableDef/GlobalDefaults/
│   │                      #   effectiveUpdateConfig()（a 档解析，调度与提示词必须用它）/FillApiConfig 等
│   ├── table-store.ts     # 表格 CRUD（chat 变量 __of_tables__）；importTemplate 有 zod 校验，坏表跳过
│   ├── settings.ts        # 业务设置 Facade（底层是 core/settings）
│   └── prompt-defaults.ts # 填表提示词模板默认值（世界书段默认开）
├── fill/                  # 填表引擎
│   ├── prompt-builder.ts  # ★ 分组拆请求 + 占位符替换（必须用 effectiveUpdateConfig）
│   ├── table-renderer.ts  # 表→文本（sendLatestRows/行模板；单元格宏替换）
│   ├── messages-slice.ts  # 按轮取对话（1 轮=用户+AI）+ buildRawRecentText（绿灯扫描用）
│   ├── context-filter.ts  # extract/exclude 标签边界匹配（取最后一对）
│   ├── worldbook.ts       # 世界书读取（蓝灯全发/绿灯关键词/概率；EJS+宏编译；不截断）
│   └── api-call.ts        # generateRaw 封装（custom_api 组装、should_stream 开关、json_schema）
├── chat/
│   ├── chat-adapter.ts    # ChatAdapter 接口（+可选 stop/onStreamUpdate）
│   └── guided-chat-adapter.ts # 引导对话引擎：独立会话（__of_dialogue__.history），不读写酒馆楼层
├── dialogue/              # 规则包体系
│   ├── rule-package.ts    # ★ RulePackageSchema（规则文/表格/结算契约/种子行）
│   ├── builtin-packages.ts# 内置包列表；加内置包改这里
│   ├── package-registry.ts# 包注册表：list/getActive/setActive/import/delete
│   ├── state-machine.ts   # 七步进度 + 对话历史（chat 变量 __of_dialogue__）
│   ├── settlement-parser.ts # 结算块提取/解析（标记与必填键由包提供）
│   ├── apply-settlement.ts# ★ 落地：按包表格 importTemplate + 种子行；scope: always/onSeed 按需建表
│   └── rules-content.ts   # 自定义开局的规则全文（system 注入）
├── preset/                # 角色卡专用开局（数据由生成器从源 HTML 提取）
│   ├── preset-data.ts/.json     # 剑与汽水 4 线（爱丽丝/沧月汐/似久/墨白）
│   ├── jianbandai-data.ts/.json # 渐变带 学院线（陆安）
│   ├── preset-apply.ts    # applyPresetTables / injectOpeningToFloor0 / 世界书按线切换（UID 分组）
│   ├── jianbandai-apply.ts# 渐变带表格写入 + 世界书 0-13 控制（全蓝灯/路线默认/恢复初始）
│   ├── preset-store.ts    # 剑与汽水向导进度（__of_preset_state__）
│   └── chat-vars.ts       # 聊天变量 get/set 通用封装
├── gradband/              # ★ 渐变带·自由回路 业务核心（见 §9）
│   ├── index.ts           # 中枢：initGradband/destroyGradband；OPENING_MARKER='<渐变带开局/>'
│   ├── core/              # schema.ts（引擎存档 zod）/ store.ts（loadGame/saveGame/syncSnapshot）/
│   │                      # settings.ts（渐变带设置）/ presets.ts / time.ts
│   ├── pipeline/          # scheduler.ts（★回合管线）/ data-ai.ts / spell-ai.ts / settle.ts /
│   │                      # contract.ts（变更包校验）/ serialize.ts / ai-common.ts（callAI）
│   ├── engine/            # circuit-engine.js（★纯函数核算引擎，UMD 挂全局）+ engine.ts（转具名导出）
│   ├── ops-table.ts       # 操作表（状态栏手操 → 确认扣费）
│   ├── feel-tables.ts     # 陆安追踪表注册（v1.7.0 起走标准填表，无独立感情AI）
│   ├── opening/grants.ts  # 开局发放（新手包/自挑 → 应用开局）
│   └── assets/            # opening.html / statusbar.html（旧六页）/ statusbar-desk.html（★双桌）/
│                          #   statusbar-mobile.html（v1.8.9 手机简化版，配套 regex-状态栏-手机.json）
├── sync/
│   ├── message-sync.ts    # ★ 楼层变量同步：stat_data.开局框架（{表名:[{列:值}]}，宏替换）
│   └── status-placeholder.ts # <StatusPlaceHolderImpl/> 楼末追加（默认开；refresh:'affected'）
├── ui/
│   ├── app.ts             # 面板壳：PAGES 数组（加页面改这里）+ switchTo/refreshCurrent
│   ├── state.ts           # 引擎管理（getGuidedEngine/reset/startGuidedDialogue；空规则包拦截）
│   ├── styles.ts          # ★ 唯一样式源（PANEL_CSS）；手机适配在末尾 @media (max-width:640px)
│   └── pages/             # 每页一个 render 函数（start/preset-opening/jianbandai-opening/
│                          #   chat/tables/sheet-config/api/settings/prompt-template/tools/gradband*；
│                          #   api=API 集中页：填表+数据AI+法术AI，温度默认0.8/max_tokens默认5000）
└── utils/macros.ts        # substituteMacros（{{user}} 等；数据出口必须过这里）
```

**顶层目录**：`dist/`（构建产物，**不能移动**——脚本版 CDN 靠它）；`docs/具体介绍.md`（AI 技术细节）；
`归档/`（旧文档与历史快照，仅供追溯）；`releases/酒馆助手脚本-战役.json`（package-loader.mjs 生成）；
`json/regex-开局|状态栏.json`（正则导入包，replaceString 对齐 dist HTML，重新 build 后需重生成）；
`scripts/`（preset 数据生成器）；`美术预览/`（独立预览页）。

---

## 2. 两条数据通道（改数据相关功能前必读）

| 通道 | 存哪 | 什么时候清 | 用于 |
|---|---|---|---|
| **chat 变量**（TavernHelper） | `__of_tables__`（表格）/ `__of_dialogue__`（引导会话+七步进度）/ `__of_preset_state__`（剑与汽水向导进度）/ `__of_jianbandai_state__`（渐变带向导进度）/ `渐变带`（渐变带引擎存档）/ `渐变带.操作表`（手操）/ `渐变带日志`（回合日志） | 换聊天自动隔离；「重置开局/清除进度」手动清 | 表格数据、引导对话、向导进度、渐变带存档 |
| **extensionSettings**（SillyTavern） | `opening-framework` 命名空间 | 跟着酒馆设置走 | 全部设置（OfSettingsSchema）、导入的规则包、渐变带设置 |

**规则**：
- 表格/对话/进度一律 chat 变量（换聊天各自独立）；设置一律 extensionSettings。
- chat 变量必须轻量校验后使用（参考 `state-machine.loadDialogueState` 的 sanitize 模式）。
- `z.record` 等写法注意 zod v3 兼容；schema 改动必须向后兼容（旧数据要能 parse 通过或 .catch 兜底）。

## 3. 填表数据流（标准表格，改填表相关必读）

```
MESSAGE_RECEIVED(AI回复) → schedule/trigger 计数 → 逐表 effectiveUpdateConfig() 判定到期
  → buildRequests：按 group 分组 → 每组一次 generateRaw
     组内 contextRounds/skipFloors 取成员最大值
     ordered_prompts = promptTemplate.segments（占位符替换；{{worldbook}} 段启用才预取世界书）
  → api-call（json_schema 强制 JSON；should_stream 由 fillApi.stream 控制）
  → response-parser（JSON.parse+zod；预检表/行存在）→ applyOperations（纯函数，事务性落盘）
  → maybeAutoSyncAfterFill()（自动同步开着 → syncToLastFloor）
```

**a 档规则**：`UpdateConfig.useGlobal=true`（默认）时，
`effectiveUpdateConfig(sheet, globalDefaults)` 返回的参数全部来自全局默认
（contextRounds/updateFrequency/skipFloors/sendLatestRows/extractTags/excludeTags；
structured rules 清空）；只有 `group` 永远单表。**任何新填表逻辑都不得直接读
`sheet.updateConfig`，必须走 `effectiveUpdateConfig`。**

全局默认：频率 3、提取 `<content>|</content>`、世界书段默认开。

## 4. 引导对话（独立会话）

- 历史存 `__of_dialogue__.history`（sanitize 后使用，上限 200 条），**不读写酒馆楼层**——
  这是刻意的隔离（用户要求引导不掺正文聊天）。
- 发送流程：玩家消息入历史 → `generateFromHistory()`：
  `rulesText（当前包） + buildProgressHint() + 最近 maxHistoryEntries 条` → generateRaw
  （`should_stream: true` + `generation_id`；`onStreamFullText` 按 id 过滤推流式气泡）
  → AI 回复入历史 → `analyzeReply`（台账行/步骤推进/结算检测）。
- 失败回滚：生成抛错时 pop 掉玩家消息（主动 stop 除外，保留消息不报错）。
- 结算落地后：`applySettlement`（按当前包表格）+ `syncToLastFloor()`（无条件）。

## 5. 规则包体系（换卡 = 换包）

- `RulePackageSchema`：id/name/description/rulesText/tables/settlementStartMark/
  settlementEndMark/requiredKeys/seedRows/builtin。
- 内置包在 `builtin-packages.ts`（代码级，可带 `seedDynamic` 动态种子——从结算字段算行；
  导入 JSON 包只有静态 `seedRows`）。
- 引擎三样东西全部来自当前激活包：规则文本、结算契约（标记+必填键）、落地表格。
- 未配置包（rulesText 空）→ `startGuidedDialogue` 拦截并提示。

## 6. 角色卡专用面板（preset 体系，加新卡照此模式）

源 HTML → 生成器提取 → JSON → 运行时模块 → 面板页。**不要手抄数据**，照生成器模式写：

1. 生成器：`scripts/gen-xxx-data.mjs`——从源 HTML 的 `<script>` 切数据段，`new Function`
   沙箱求值，转成本扩展格式（去 row_id 列；sourceData 拆成 note/insertRule/updateRule/deleteRule；
   输出 `src/preset/xxx-data.json`）。
2. 运行时：`preset/xxx-data.ts`（加载 JSON）+ `preset/xxx-apply.ts`
   （applyXxxTables：importTemplate + seedInitialRows + **宏替换**；世界书 UID 分组控制）。
3. 面板页：`ui/pages/xxx-opening.ts`——向导步骤、进度存 chat 变量（参考 `chat-vars.ts`）、
   完成时**无条件 `syncToLastFloor()`**、注入第 0 楼走 `injectOpeningToFloor0`。
4. 注册：`ui/app.ts` 的 `PAGES` 数组加一条。

## 7. 状态栏三件套（开局框架侧）

1. **楼层变量**：`sync/message-sync.ts` → `stat_data.开局框架`，形状 `{表名:[{列名:值}...]}`
   （表头作键；**单元格宏替换**后写入）。自动同步开关 `autoSyncEnabled`（默认开）+
   开局完成时点无条件同步 + `clearSyncRange(lo,hi)` 范围清除。
2. **楼末标记**：`sync/status-placeholder.ts` → `<StatusPlaceHolderImpl/>`（默认开；
   已有不重复加；用户楼不处理；`refresh:'affected'`）。
3. 前端界面从楼层变量读数即可。

## 8. UI 约定（指南强制）

- **命名空间**：DOM id / CSS class / CSS 变量一律 `of-` 前缀。
- **样式**：只写 `ui/styles.ts` 的 PANEL_CSS（构建提取为 index.css，manifest 注入）；
  手机适配（≤640px）在文件末尾的 media query 里（面板近全屏、侧栏横排、网格降列）。
- **窗口/悬浮球**：位置尺寸持久化到 extensionSettings；悬浮球是唯一入口，
  有三层保底（最先挂 / 3 秒自检补挂 / 失败重试一次）——改 index.ts 时不要破坏。
- **z-index**：窗口 9999、悬浮球 10000。
- **模式切换器位置**：`.of-modepicker` 固定**窗口左上角**（`top:8px; left:10px`，v1.8.1 起从
  内容区右上移来），z-index 5、压在侧栏上方；`.of-nav` 用 `padding-top:36px` 给它让位——
  改这两处要成对改，别把按钮挪回内容区。手机端（≤640px）它是 `position:static` 横排。
- **页面生命周期**：页面事件订阅挂到 `(el as any)._ofDispose`，app.ts 切页时统一调用。
- **宏**：数据出口（同步/渲染/种子写入）必须过 `utils/macros.substituteMacros`。

---

## 9. 渐变带 · 自由回路（业务核心，`src/gradband/`）

### 9.1 两类数据的隔离（最重要，别搞混）

| | 渐变带引擎存档 | 标准表格 |
|---|---|---|
| 存储 | chat 变量 **`渐变带`**（根本不在 `__of_tables__`） | chat 变量 `__of_tables__`（type=standard） |
| 内容 | `{ version, 主角, 补给物品, 回路库, 槽位, 亲和, 待扣单, 场景 }`（zod：core/schema.ts） | 感情表（陆安追踪表）+ 玩家自建表 |
| AI | 数据AI / 法术AI（提示词在「渐变带·提示词」页） | 开局框架标准填表（提示词用「提示词模板」页，全表共用一套） |
| 快照 | `stat_data.渐变带`（store.syncSnapshot） | `stat_data.开局框架`（message-sync） |

隔离靠**存储位置**天然实现，不需要过滤逻辑。**历史注意**：v1.7.0 已删除独立感情AI
（feel-ai.ts 已不存在）；陆安追踪表现走开局框架标准填表流程（enabled:true）。
状态栏 HTML 是正则注入的独立脚本，读不到扩展表格存储，所以手操走 chat 变量 `渐变带.操作表`。

**回路记录新增字段（v1.8.3 引入，v1.8.4 起开局预设亦有）`物理相态与表征`**：可选字符串，代表**正文AI 叙事唯一形态锚点**，
由法术AI 送审通过时按五系机理分流写入（倾泻=准直射束／波动·媒介波=介质与激波／波动·场=无形场域／
结构=晶格相态与就地取材·绝无弹道／生机=渗透与组织异变·绝无弹道光球／感知=神经感官与无形球域）；
**开局送的固定回路同样带该字段**（数据源在开局面板自己的 `BRANCH_CIRCUIT[br].表征`，五系口径与上面一致）。
改动一个字段要同时动**六处**，别漏：`core/schema.ts` 回路Schema（zod，缺了会被 strip）、
`pipeline/spell-ai.ts`（两个 json_schema + 结果类型 + 兜底）、**`assets/statusbar-desk.html`
（剧情获得 + 自创申报两个 json_schema、`getSpellPrompt` 兜底文案、两处入库写入、详情页 specs 的「形态」行）**、
`assets/statusbar.html`（旧六页版同样三处）、**`assets/opening.html`（`BRANCH_CIRCUIT` 18 条数据 + `circuitFor()`
返回值写入；改它必须重生成 `json/regex-开局.json` 并让用户重导开局正则）**；另 `core/presets.ts` + `opening/grants.ts`
为契约同步（二者不进 bundle，只为口径一致）。⚠️ 双桌 HTML 里的 `additionalProperties:false` 意味着
**不加进 schema 的字段 AI 根本输出不了**；⚠️ **该字段绝不可写 `null`**（`z.string().optional()` 不收 null，
会让整个存档 parse 失败），无值时省略该键即可（`p.表征` 缺失即 undefined→JSON 丢键）。
v1.8.3 之前生成的旧档没有该字段（undefined，详情页显示「—」），别硬补默认值。

**下游消费者（改回路字段时也要对一遍）**：`docs/渐变带2.0 世界书.json` 的条目 15「渐变带状态注入」
是给**正文AI** 的施法调度面板（`@@private` + EJS），逐字段渲染回路库。新增的回路字段若正文AI 该看到，
必须同步该条目，否则字段只存不用。它是**用户导入 SillyTavern 世界书**的产物，仓库里的 JSON 只是留档 ——
改它**不触发 build、不需要重升版本、也不需要重导正则**（同目录 `世界书条目-渐变带状态注入.txt` 是同一份内容的
可复制副本，两者要保持一致，改一处必改另一处）。该面板还有两个易踩的坑，已在条目里修正并留注释：①**`过载率`
键名不带百分号**（历史文档里的「过载率%」是从未存在过的幽灵键，读它会让过载率恒被当成 100%）；
②**走火判定权归脚本**，消费引擎预掷的 `本轮走火`，不要在条目里 `Math.random()` 另摇一次骰。

### 9.2 回合管线（pipeline/scheduler.ts 的 runTurn）

```
MESSAGE_RECEIVED（type∈normal/regenerate/continue/swipe）→ busy 防重入 + 开关.频率 取模
runTurn：
  1. clearOps()                     清空操作表（状态栏手操不跨轮）
  2. loadGame()                     读 chat 变量 `渐变带`
  3. runDataAI(g)（开关.自动结算）   正文→变更包 JSON → contract 校验（不过=整包打回）
  4. settle(g, pack)                纯函数结算：扣待扣单/计次/Δt 恢复/剧情变更…
  5. saveGame(g) → syncSnapshot(g)  写回存档 + 快照到最新楼
  6. 回合日志 → chat 变量 `渐变带日志`
finally：开关.状态栏标记 → 楼末追加 <StatusPlaceHolderImpl/>
```

手动入口：工具页「手动结算一次」= `manualTurn()`。状态栏手操的「确认操作」（ops-table）
走 `confirmOps`：quote 算费后**当场扣能量/精神结清，不挂待扣单**（待扣单只留给 AI 报的回路）。

### 9.3 引擎（engine/circuit-engine.js）

- 615 行**纯函数** JS，无 DOM/UI，UMD 挂 `window.CircuitEngine`（E）；`engine/engine.ts`
  以副作用引入并转成具名导出。**业务代码不许直接 import circuit-engine.js**，一律走 engine.ts。
- 铁律「数字只被脚本改」：AI/玩家不得自行算数，一切计算过 E（quote/settleCircuitLibrary/…）。
  正文 AI 只看锚点级描述（引擎 readableParams / serialize.ts 负责翻译）。
- v2.2 要点：瞬时爆发线=持续×爆发倍率（倍率存 `主角.爆发倍率`，旧档 loadGame 反推）；地震等引信类
  做功口径 = 全能量×`TUNE.seismicWorkFrac`(2%) 且恒比爆发线；每条回路每轮预掷 `本轮走火`（对玩家界面不可见）；
  亲和磨炼=全陌 ×4→×2（按 workE 实际做功能量累计，生机系能量门控恒 ×1）——磨炼倍率映射由 engineCtx 下发。
- **v2.3 要点：固定回路精神折扣**。`quote()` 新增可选入参 `req.固定`（宿主按回路 `type === 'fixed'` 传 true）
  → 精神账单 ×`TUNE.fixedMindMul`(0.2，即 ÷5)，兑现「固定槽=肌肉记忆、精神消耗极低」的设定；
  与 `findTuned` 的 ×0.3 **二选一不叠加**（改成了 if/else if）。⚠️ 自由/现构回路**绝不能**传该位，
  否则等于白送 5 倍精神折扣。当前所有调用点（opening.html circuitFor、双桌手操/送审入库、旧六页版
  施放手操、settle.ts 构建回路记录/补挂/施放挂单、ops-table.ts confirmOps）均已按 `type` 传参。
  引擎 VERSION → 2.3.0。
- smoke 里 `globalThis.module=undefined` 是故意的（让 UMD 引擎挂 window）；engine.ts 两侧都找。

### 9.4 状态栏 / 开局 HTML（正则注入）

- 查找标记：开局 `<渐变带开局/>`（gradband/index.ts OPENING_MARKER）、状态栏
  `<StatusPlaceHolderImpl/>`。**不自动注册正则**——用户手动导入（或导 `json/regex-*.json` 包）。
- 状态栏自带存档闭环：`writeGame(mut)` → updateVariablesWith 改 chat 变量 `渐变带` +
  300ms 后同步 stat_data 快照。玩家操作（施放/装槽/补给/手操确认）都走它，与 saveGame 同存储。
- 改状态栏/开局 HTML 后：`node build.mjs` 重新生成 dist → **用户需重新导入正则**。
- **法术AI 送审的「送审中」状态（v1.8.6）**：送审有两个入口——送审槽（`reviewCircuit`，剧情获得回路）
  与自由构筑「申报入自由库」（`#btnSaveToRepo`，自创回路），二者共用同一支法术AI。各自维护
  `isReviewing` / `isForging` 忙碌标志，并由 `spellReviewBusy()` 统一做并发守卫（一个在途时另一个禁发起，
  避免并发扣费 / 重复入库）。**发起送审时必须立刻渲染忙碌态**（按钮禁用+改文案、送审槽 `.is-busy`
  加载遮罩、详情页送审按钮同步），否则用户看不出是否已发出而重复点击。完成/驳回/超时/异常四条路径
  都要复位（统一走 `updateReviewDock()` / `renderForgeBusy(false)`），并保留「令牌 + 超时兜底」防迟到响应二次落地。
- **亲和 ctx 键名契约（血的教训，v1.8.5）**：引擎 `tierOf/gateOf` 读的是 `aff.main[].fam / .br`，
  而存档 `亲和.主分支` 存的是 `{族, 分支}` —— HTML 面板**必须自己转名**：
  `{ fam: b.族, br: b.分支 }`，且 **fam 装的是中文族名**（引擎内部 `FAMKEY[famKey]` 英文→中文再比对；
  `settle.ts` 的 `affinityEngine()` 是官方范式）。漏转会**静默**退化成「全陌」→ 精神×4、能量×4，
  同时污染报价、挂单扣除与基线账单三处（v1.8.5 修的正是它，坏在 `opening.html` 的 `ctxRef()` 与
  两个状态栏的 `affinityOf()`）。**改完必须用真存档跑一次 `tierOf` 验证 main/mid/far 三档**，
  别只看有没有报错。
- 布局契约（双桌版）：不碰 body/视口（改归 `#gdesk` 容器）；画布视口 100%×860px 相对定位；
  `position:fixed` 只允许弹窗/装饰。曾否决：内联小修、iframe srcdoc 包裹——别再试。
  数据契约详见 `docs/具体介绍.md` 第二部分。

### 9.5 渐变带别乱改清单

- 标准/特殊隔离靠存储位置：不要往 `__of_tables__` 塞引擎数据，也不要让数据/法术AI 读标准表。
- 操作表确认**只扣费不挂单**：用户明确要求，别改回挂单。
- 状态栏不自动注册正则；改 HTML 必 build + 用户重导。
- 入口只有悬浮球：脚本按钮在主页面调用无效，别加输入栏按钮。
- 陆安追踪表走标准填表（无独立感情AI）——别按旧文档把 feel-ai 加回来。
- 版本三处同步 + package-loader 重生成，改版必做（见 §12）。

---

## 10. 文档地图（2026-09 三合一后）

| 文档 | 读者 | 内容 |
|---|---|---|
| `README.md` | 人 | 是什么、怎么装、怎么玩（简单流程 + 原理） |
| `AGENTS.md`（本文件） | AI | 总介绍：架构、目录、数据流、修改规矩 |
| `docs/具体介绍.md` | AI | 技术细节四部分：①引擎计算规格 ②状态栏HTML数据契约 ③世界书条目编写参考 ④数据AI/法术AI提示词契约 |

`归档/` 里的旧文档与历史会话快照**仅供追溯，不代表现状**（顶部都有横幅说明并指向新位置）。

## 11. 构建与验证命令

```bash
pnpm install --ignore-workspace   # 首次（仓库根有 workspace）
node build.mjs                    # 产 dist/index.js + dist/index.css + 三个 HTML（css 从 styles.ts 提取）
node node_modules/typescript/bin/tsc --noEmit   # 类型检查（必须 0 错误）
node smoke.mjs                    # 冒烟：shim DOM 跑通 init/destroy（shim 刻意最小，缺 API 先补 shim）
node package-loader.mjs           # 生成 releases/酒馆助手脚本-战役.json（23 项自检）
```

## 12. 版本与发布流程（每次改完）

1. 改 `core/version.ts` + `manifest.json` + `package.json`（三处同步，当前 1.8.6；
   版本以 `manifest.json` 为准，别凭记忆写）。
2. `node build.mjs` → `tsc --noEmit`（`pnpm run check`）→ `node smoke.mjs`。
3. 改了 manifest 版本号 → `node package-loader.mjs` 重新生成 `releases/酒馆助手脚本-战役.json`
   （回退版本号自动嵌入；自检必须全 ✅）。
4. **仅当 dist 的两个 HTML 有变更时**重新生成 `json/regex-开局.json` / `regex-状态栏.json`：
   用新 dist 的 HTML 覆盖其 replaceString（查找标记分别是 `<渐变带开局/>` 和
   `<StatusPlaceHolderImpl/>`，别动其他字段）。`git status` 里 `dist/*.html` 未出现在改动中
   ＝ 逐字节未变，跳过本步（用户也无需重导正则）——纯 TS/CSS 改动不影响 HTML 内容。
5. 用户侧发布：`git add -A && git commit && git push` + `git tag vX.Y.Z && git push origin vX.Y.Z`
   （push 更扩展版，tag 更脚本版；tag 撞名先 `git tag` 查占用）。

## 13. 已知限制 / 设计取舍（别"修复"它们）

- 脚本按钮（appendInexistentScriptButtons）在主页面调用无效——入口**只有悬浮球**。
- 引导对话刻意不含世界书/酒馆楼层（规则包设计）；填表才带世界书。
- `onSeed` 表开局没建，后续填表引用会整体失败——包作者慎用。
- 结算契约/动态种子目前仅代码内置包可用；导入 JSON 包只有静态种子行。
- reroll 只支持最后一条 AI 回复（酒馆 regenerate 语义）。
- smoke.mjs 的 shim 是刻意的最小实现，跑不过先查是不是用了 shim 没有的 API。
- HTML 面板与 bundle 的更新节奏不同步（前者手动重导正则），数据契约必须向后兼容旧 HTML。
