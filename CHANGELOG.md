# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

## [0.8.14]

### Changed

- **上游/模型卡片几何修复**（无头 Chrome 实测驱动，修正三项反馈）：
  - 按反馈**删除 `.frp-ucard` 的 `padding: 12px 14px`**（连同 `gap`），内边距改由
    行头（`8px 10px`）与卡身（`10px 10px 12px`）各自承担；卡片高度 46→38px，
    不再撑宽撑高。
  - **chevron 改固定 16px 方形盒**：原先裸 '›' 旋转后字形戳出行头右缘
    （实测任意宽度恒定溢出 7px，即「head 超出外部区域」），方形盒旋转后
    溢出归零。
  - 行头/文本区显式 `flex-direction: row` + `flex-wrap: nowrap`（防御性：
    任何环境下名称/标签/圆点都不堆叠换行，超长一律省略号）。
  - ↑/↓ 图标按钮微缩（11px / padding 2px 5px），缓解行头拥挤。

### Tests

- 无头 Chrome 几何回归：200–720px 全宽度卡片高 38px、head 溢出 0、
  text 单行 20px、name 正常省略。client-integration 51 项不变全绿。

## [0.8.13]

### Changed

- **「免费」列表行几何对齐默认 provider 行**（修正 0.8.11 引入的布局偏差）：
  - 模型条目放弃比例网格列（第二列文字从行中 58% 处起排，视觉居中悬浮），
    改为单行 flex 左贴：等宽 id 定宽 + 名称·上下文弹性左对齐（超长省略）+
    chevron 靠右；条目内边距 6px → 4px 8px（≈原生 candidate 行 26px）。
  - 供应商映射行同步收紧（padding 4px 8px），与模型行同高。
  - 上游行头对齐原生 rowIdentity/rowActions 结构：名称 → Key 标签 → 状态圆点
    顺序（credentialDot 同位），控件区（↑/↓/开关）改 `margin-left:auto` 右移，
    文本区不再 `flex:1`；圆点 9px → 8px 对齐原生 credentialDot。

### Tests

- client-integration 第 7 节断言同步（行头 rowIdentity 三件套、chevron 索引、
  模型行条左贴结构），51 项全绿。

## [0.8.12]

### Changed

- **「免费」面板字号整体收一档**：行头名称 14→13px、模型 id 与供应商映射模型
  13→12px、字段值 13→12px、高级设置分组标题 15→13px、面板头标题 16→14px。
  卡片/网格/字段结构不变，仅回到紧凑排版。

## [0.8.11]

### Changed

- **「免费」面板列表形态对齐「设置 → 模型」页（默认模型列表）**：
  - 上游卡片改为宿主 rowCard 形态——透明底、`.5px` 边框、圆角 16px、内边距
    12px 14px；行头内联一行：状态圆点 + 名称（14px/500）+ Key 状态小标签
    （rowTag 同款）+ ↑/↓ + 启停开关 + 旋转 chevron；完整状态摘要（免费模型
    占比 / 冷却 / 上次探测）挪进卡身「运行状态」字段行，行头不再换行拥挤。
  - 「模型」卡条目改为宿主 modelEntry 形态——小边框盒 + 网格行
    （等宽字体模型 id | 名称 · 上下文 | chevron），点击展开「供应商」字段行，
    逐行列出上游名 + 实际映射模型（等宽字体），替代原先名称/上下文/供应商
    三行混排的紧凑行列表。
  - 卡片栈间距对齐模型页 rows（8px）；`.frp-tag` 对齐 rowTag token。

### Tests

- client-integration 第 7 节更新并新增断言（总计 51 项）：行头 Key 标签、
  运行状态字段行、modelEntry 网格行（role=button + aria-expanded）、
  供应商 vialist/viarow（上游名 + 映射模型）。

## [0.8.10]

### Changed

- **「免费」面板重排为「设置 → 插件」页同款的可展开卡片**：每家上游一张卡——
  卡片头（名称 15px/600 + 状态摘要 13px 上下两行 + ↑/↓ 优先级 + 启停开关 +
  旋转 chevron）点击就地展开卡身（密钥/测试连通/探测模型/申请链接），「模型」
  与「高级设置」（全局代理 + 远程目录）也是同款卡片；高级设置展开后是字段
  分组而非嵌套卡。样式逐 token 对齐宿主 PluginCard（`.5px` 边框、圆角 16px、
  bg-layer-3、hover 描边、开卡 bg-layer-2、chevron 旋转 180°），卡片间距 10px
  与插件页一致。旧的单外框紧凑行列表（`frp-plist`/`frp-prow`）移除。
- 可达性：卡片头 `role="button"` + `tabIndex` + `aria-expanded`，Enter/Space
  就地展开；↑/↓/启停开关 `stopPropagation` 不触发展开。
- 0.8.9 的「默认 | 免费」页签骨架保持（同样对齐插件页顶部结构：下划线页签、
  aria 角色、方向键导航、访问过的面板保持挂载）。

### Tests

- client-integration 新增第 7 节（19 断言，总计 48 项）：带状态的 React 替身 +
  完整 state 全量渲染面板——卡片栈/卡片头结构、点击与键盘展开、chevron 旋转、
  卡身字段分组、隐藏恢复行；state 未到时形状守卫降级卡不炸设置槽。

## [0.8.9]

### Changed

- **恢复「设置 → 模型」页的页签切换形态**：0.8.8 把面板迁到官方
  `settings.models.footer` 子插槽、渲染为页面底部的可折叠区块；用户反馈
  「默认 | 免费」页签切换更自然，本版回到 0.8.7 的交互——标题与介绍保持原位，
  页签条插在介绍之后（结构对齐「设置 → 插件」页：下划线页签、aria 角色、
  方向键导航），「免费」页签隐藏内置内容并承载完整面板，访问过的面板保持
  挂载；插件停止时换回原组件、移除页签条并还原可见性，完全可逆。
- 官方 footer 子插槽渲染在提供方行与添加区之后（页面底部），给不出「同一
  内容区切换默认/免费」的语义，页签形态仍需换血内置 models 条目的
  component + 在内置页 DOM 插自绘页签条。该做法在 dsh 0.1.5-rc.2 上实测可用
  （renderer/settings 客户端与 0.1.2-rc.1 字节一致），并保持防御性实现：
  只动自建节点、条目缺失退独立设置页、停止完全还原。
- 0.8.8 的其余内容不变（视觉模态契约修复、免费模型配置刷新、宿主侧测试）。

### Tests

- `client-integration` 测试随页签架构重写：换血条目（component 替换/还原、
  幂等、options 保留）、无 models 条目兜底、条目晚出现接管、停止可逆（含
  停止后不复活）、渲染形态（frp-tabpage + 默认 tabpanel 承载原组件 + 懒挂载）
  与源码契约（tablist/页签文案/MutationObserver 守护/无反引号）。

## [0.8.8]

兼容目标：dsh 0.1.5-rc.2（同时保持对 0.1.2-rc.1 起的行为兼容）。

### Fixed

- **会话内图片输入此前被宿主拦下/丢弃（0.8.6/0.8.7 的透传从未真正生效）**：
  适配器对所有模型硬编码回传 `inputModalities: ['text']`。按 dsh-llm 的
  `LlmModelInfo` 契约，**缺省 = 未知**，而**显式 `['text']` = 负能力**：
  `resolveModelInfo` 会在入站时直接拒绝附图
  （`MODEL_DOES_NOT_SUPPORT_IMAGES`），已附图的历史消息还会在派发前被投影成
  `[image omitted because this model accepts text only; …]`——模型只会「听说」
  有图。现在只有来源明确声明支持视觉的模型才回传 `['text','image']`，其余
  一律不写该字段（未知 = 图片原样透传给上游，由 4xx → 候选链自愈）。
- 视觉能力的三条来源全部接通：内置种子表（`deepseek-v4-flash-vision-exp` /
  `openrouter/free` / `ling-3.0-flash-vl` / `gemma-4` / `glm-4.6v` 等）、
  远程与 native 目录（`inputModalities: ['text','image']`、简写 `vision: true`、
  models.dev 的 `modalities.input`）、上游 `GET /models` 探测
  （OpenRouter 的 `architecture.input_modalities`、部分网关的 `input_modalities`
  / `modalities`）。自定义上游 patch 与 `apply-patch` 校验同步支持该字段。

### Changed

- **「设置 → 模型」页集成改用宿主官方子插槽 `settings.models.footer`**
  （dsh 0.1.x 起提供，0.1.5-rc.2 实测可用）：完整 FreeRoute 面板作为提供方行
  与「添加」区之后的独立区块渲染，标题行可折叠、默认展开（收起即卸载面板，
  5s 状态轮询随之停止）。删除了自 0.4 起的 DOM 换血实现——包裹内置 models
  条目的 `component`、`MutationObserver` 往宿主 DOM 插自绘页签条、隐藏/还原
  兄弟节点——那套做法依赖 `h2`/`intro` 的 DOM 形状与 React reconciliation 的
  巧合，宿主一改版就会错位或闪烁。
- 兜底路径保留：宿主未声明该子槽时（旧 dsh / 未加载模型页插件）宽限 2.5s 后
  回落到独立 freeroute 设置页；声明晚到时兜底页自动撤销，不会出现两个入口。
  插件停止时所有注册随 fiber 撤销，完全可逆。
- devDependency `@deepseek-ai/dsh-typert-protocol` `0.1.2-rc.1` → `0.1.5-rc.2`
  （对齐宿主；运行时仍优先锚定宿主自带副本）。peer 范围保持
  `>=0.1.0-rc.6 <0.2.0` 不变。

### 免费模型配置

- OpenCode Zen 种子表按 2026-09-11 live 核对重写：`x-preview-f-free` /
  `hy3-free` / `laguna-s-2.1-free` 均已下线；现役 7 款 `-free`
  （`deepseek-v4-flash-free` 为首选，含 `muse-spark-1.3/1.2-contributor-free`、
  `ling-3.0-flash-fin-free`、`nemotron-3.5-lightning-free`、`nemotron-3-ultra-free`、
  `mimo-v2.5-free`）。
- OpenRouter 种子表换成现役免费档（`openrouter/free` 等 8 款，其中 4 款带视觉
  声明）；旧表里的 `deepseek-chat-v3-0324:free` / `qwen-2.5-72b:free` 等已不再免费。
- SenseNova 首选模型对齐 `deepseek-v4-flash`；`KNOWN_BASE` 修正为
  `https://token.sensenova.cn/v1`（`api.sensenova.cn/compatible-mode/v1` 对目录
  同步与推理均返回 403）。
- 仓库内备份目录 `freeroute-dynamic/catalog/freeroute-catalog.json` 同步到线上
  10 家上游的现状（此前停在 6 家 / 2026-08-26），并补上视觉声明。

### Tests

- 新增 `freeroute-dynamic/test/client-integration.mjs`（23 断言，纯 node，无需
  浏览器）：官方 footer 注册、宽限期兜底、晚到声明接管、停止可逆、DOM 换血
  已移除的源码契约。已纳入 `npm test`。
- 宿主集成测试新增第 21 节（16 断言）锁死模态语义：声明视觉 → `['text','image']`，
  未声明/auto/未知模型 → 不带 `inputModalities`；覆盖内置 patch、native 目录、
  `vision: true` 简写与 `/models` 探测四条路径。
- smoke 与集成测试全绿（宿主 199 项 + 客户端 23 项 + smoke 全通过）。

### 发布链

- `package.json` 的 `repository` / `homepage` / `bugs` 由 `0xrushmoon/dsh-freeroute`
  修正为 `dushaobindoudou/dsh-freeroute`（npm 账号与 tag 触发的发布工作流所在
  仓库）。此前 provenance 校验按 `repository.url` 比对运行工作流的仓库，二者
  不一致导致 `npm publish` 以 E422 失败；README 徽章、CONTRIBUTING 克隆地址、
  discussions 链接、目录 `$schema` 与 OpenRouter 的 `http-referer` 同步对齐。

## [0.8.7]

### Fixed

- **入站 OpenAI wire 多模态丢图**（0.8.6 修的是出站腿，本次补上入站腿）：
  `inboundToInternal` 的 user 分支此前用 `strContent` 只抽文本——客户端以
  OpenAI 多模态形态（`content:[{type:'text'},{type:'image_url',…}]`）发来的
  图片部件在入站归一化时被**静默剥掉**，模型只会「听说」有图（实测三种
  视觉模型全部回复「没有看到图片」）。现在 `image_url` 部件转成 dsh 原生
  image 块（data URL → `data`+`mimeType`；http(s) → `url`），交由 0.8.6
  已修好的 transport 出站腿透传；file:/ 空部件按既有约定静默丢弃；纯文本
  入站（字符串 content）路径不回归。
- smoke：升级伪 `webServer` 为捕获式，挂载真实 `routeHandler` 到本地端口，
  新增「■ 4d 入站多模态」用例——OpenAI wire 带图请求必须以
  `image_url` 部件到达 mock 上游（text+image 次序与内容逐字段断言），
  并断言纯文本入站不回归。

## [0.8.6]

### Added

- **图片（视觉）内容透传**：`transport.js` 不再对 `type:'image'` 块抛
  `UNSUPPORTED_CONTENT` 硬错误。dsh 原生图片块（`data`+`mimeType` 或 `url`）
  与 OpenAI 原生 `image_url` 部件统一归一化后，以标准多模态部件数组
  （`[{type:'text',…},{type:'image_url',image_url:{url}}]`）发往上游；
  纯图片消息不虚构 text 部件；无法解析的图片块（file://、空块）静默丢弃
  而不是毒化整个请求。不识图的模型会由上游以 4xx 明确拒绝并进入既有的
  wireError/熔断分类——把「是否支持视觉」交还给路由与模型本身。
- smoke：新增出站请求体捕获，断言图片以 `image_url` 部件到达 mock 上游
  （取代旧的「本地拒绝图片」断言）。

## [0.8.5]

### Changed

- 兼容 dsh 0.1.2-rc.1：移除 4 个已废弃的 client peerDependencies
  （`@deepseek-ai/dsh-client-web-react` / `dsh-client-ui-primitives` /
  `dsh-client-ui-slots` / `dsh-client-runtime`——旧版 client 栈包名，新版
  dsh 运行时已由 `dsh-client-modules` / `dsh-cordis-client-runner` /
  `dsh-client-ui-renderer` 取代，且本插件构建产物从未 import 它们，仅产生
  安装告警并可能误导解析）。保留 `react`（optional，运行时基线模块）与
  `@deepseek-ai/dsh-typert-protocol`（强制，Typert Remote RPC 契约）。
- devDependency `@deepseek-ai/dsh-typert-protocol` 对齐宿主版本
  `0.1.0-rc.6` → `0.1.2-rc.1`（运行时本就锚定宿主副本，此举让 smoke 测试
  与线上 wire 协议同源）。

## [0.8.4]

### Fixed

- 本地日志路径：`DSH_HOME` 已指向 `.dsh` 根目录（如 `~/.dsh`）时不再重复拼接，
  修复日志写到 `~/.dsh/.dsh/freeroute/`（双重路径）的问题；现在写
  `$DSH_HOME/freeroute/freeroute.log`，未设置 `DSH_HOME` 时仍回退
  `~/.dsh/freeroute/freeroute.log`。

### Added

- 候选链按上下文窗口分层：基准 W = max(首选候选窗口, 最近一次成功服务的
  窗口（粘性）)，窗口 >= W（或未知）的候选保持原优先序在前，窗口 < W 的
  候选整体沉底，只有同窗/更大窗候选全部失败才降级到小窗口模型；候选只是
  沉底不是删除，全部大窗候选不可用时小窗候选仍按原顺序兜底。粘性基准保证
  大窗上游临时冷却、首选换人时基准不跌落（否则压缩风暴跨请求复发）；任何
  在小窗上游上的成功服务都会自然重置粘性（小 → 大方向天然安全）。auto
  上报窗口取分层后链首窗口，与实际可用候选一致且跨请求稳定。重排发生时记
  一条日志（签名变化去重）。动机：会话在大窗口上游积累出长上下文后，故障
  转移若直接切到小窗口上游，会触发「每步压缩 → 蒸发工作集 → 重读 → 再压缩」
  的压缩风暴（实测某会话 71 分钟压缩 82 次、零净进展）。

## [0.8.3]

### Fixed

- 重试策略从 `mode: 'always'` 改为 `mode: 'normal'`（`maxRetries: 2`，显式
  `retryableCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]`，
  backoff 不变 1s→30s / jitter 0.2）。`always` 会无上限重试永久性失败：免费池
  配额耗尽（QUOTA/AUTH）或未配置 Key（NO_UPSTREAM/MISSING_CREDENTIAL）时
  freeroute 抛出的是不可能通过重试成功的错误码，`always` 模式令请求无限挂起
  且错误永不 surfaced（冷却后每轮快速失败成 NO_UPSTREAM 仍被重试）。
  `normal` 只重试瞬时错误，永久性错误立即上抛；freeroute 内部故障转移链
  （换 Key → 换上游 → auto 兜底）继续承担跨候选恢复职责。

## [0.8.2]

### Added

- 按 dsh 插件文档（`@deepseek-ai/dsh-llm-retry`）为 freeroute 适配器配置 per-provider
  重试策略：`providerRetryPolicy` 现返回 `mode: 'always'` + 嵌套 `backoff`
  （`initialDelayMs: 1000 / maxDelayMs: 30000 / jitterRatio: 0.2`），在
  `llm.registerAdapter()` 时一次性捕获。此前省略该方法会退回 dsh-llm-retry 的
  `normal` 默认（5 次上限），现在单个模型请求失败不再受次数限制，
  由故障转移链（换 Key → 换上游 → auto 兜底）承担恢复职责。

### Changed

- 轮换/故障转移/启动日志不再打印到控制台，改写 `$DSH_HOME/.dsh/freeroute/freeroute.log`
  （ISO 时间戳行，追加写）。日志文件按 5 MB 大小或 7 天时效滚动（重命名为
  `.1`），宿主无 `fs`/`os` 注入时静默降级为 no-op。`src/host/` 与
  `src/client/` 下已无任何 `console.log`（仅 `scripts/`、`test/` 的构建与测试工具保留）。

## [Unreleased]

### Fixed

- 「200 + 配额通知文本」自动切换：部分网关（aihubmix 实测）配额用尽时返回
  HTTP 200 + 一段纯文本提示而非错误码，传输层视为成功，提示被当成正常回答
  流给调用方，轮换/冷却/切换全部不触发。现对正文前 240 字符做配额模板嗅探
  （命中即按 RATE_LIMIT 处理：换 Key → 上游冷却 → 链式切换下一上游），窗口
  外或非 text 块不受影响，不误伤正常长回答（集成测试含误伤对照用例）。

### Added

- 全局代理支持（默认关闭）：`设置 → 模型 → 免费 → 高级设置` 新增代理卡片，
  填一条 `http://127.0.0.1:7890` 型地址即让所有未单独配置代理的上游（对话
  请求与模型探测）共用它；优先级：上游 `custom.proxy` > 目录声明的 proxy >
  全局代理；远程目录同步始终直连。留空保存或「清除」按钮即回到直连。大陆
  网络用户无需再逐个上游改 JSON 配代理。

### Fixed

- 移除失效的 `postinstall` 软链脚本：npm 发布包的 `files` 白名单从未包含
  `scripts/`（脚本从未随包发布），该钩子在 pnpm 下被默认拦截、在 npm/yarn
  下会因找不到脚本而安装失败。v0.7.3 的加载时宿主锚定已完全取代其作用，
  删除后同时消除 pnpm 的 "Ignored build scripts" 提示噪音。
- 其他电脑安装后切到「免费」面板报 `transport failure for /api/freeroute/state: http 404`
  的根因修复：宿主按模块实例识别 Typert Remote 服务，pnpm v10 默认拦截
  postinstall（typert 软链脚本无法执行）且旧版 dsh 无 profiles 模块自愈时，
  插件解析到自己的 `@deepseek-ai/dsh-typert-protocol` 副本，类与宿主不同源，
  `/api/freeroute/*` 全部静默 404。现在 `lib/index.js` 加载时按
  「运行中的 dsh CLI 入口 → 全局 npm 布局 → 普通解析」顺序锚定宿主自己的副本，
  不再依赖 postinstall 与宿主版本（同环境 A/B 验证：0.7.2 404 → 0.7.3 200）。
- 自动接管不再覆盖用户已显式配置的默认模型（此前每次启动都会把
  `agent-default-model` 持久改写为 `freeroute/auto`，用户手动改回后重启又被清掉）。
  接管状态（`autoInjected` / `takeoverBackup`）持久化到配置文件，重启后关闭
  自动接管仍可恢复原默认；用户手动把默认改走即视为撤回授权。

### Changed

- 远程目录同步不再打印 `[freeroute] 远程目录已同步: …` 到 CLI（失败回退仍保留日志）。
- 远程目录改为按厂商增量合并：只更新远端有变更的条目、移除远端撤下的条目，
  永不写用户配置 —— 本地启停/自定义上游全量保留，不再整体覆盖。
- 「删除上游」拆分语义：自定义上游真删除；内置/远程上游改为隐藏标记
  （`removed`），远程同步不复活，面板底部提供「已隐藏 N 家 · 恢复」入口，
  新增 `freeroute.restore-upstream` RPC。

### Removed

- 远程默认目录裁剪：移除 Mistral、Google AI Studio、Groq、魔搭 ModelScope、
  SiliconFlow 硅基流动、智谱 BigModel（`freeroute-catalog.json` 仅保留实测
  可用的 OpenCode / SenseNova / OpenRouter；自建示例条目移入 schema 文档）。

### Changed（客户端）

- 密钥显示/隐藏重做：隐藏态用 `span` 星号掩码（`**************`）替代只读
  password 输入框；显示态为两行 textarea；切换按钮改为睁眼/闭眼 SVG 图标
  （`aria-label` 本地化，点击掩码亦可显示）。
- 面板与「默认 / 免费」页签文案中英文双语，跟随 dsh 的语言设置即时切换
  （`locale` 服务 + `useSyncExternalStore`；无服务时回落中文）。
- 主题令牌修正：`--dsw-alias-state-warn-primary`（原 `warning-primary` 不存在）、
  开关旋钮 `--dsw-alias-bg-base`，暗黑/浅色模式全面适配（边框/文字/掩码底色
  均随主题变化，已实测）。

## [0.7.1] - 2026-08-25

### Fixed

- 内置默认主源 `config.freetokenbox.com` 偶发不可达/访问不安全时，自动回退到
  备份源 `freeroute-catalog.pages.dev`（仅当使用内置默认主源时挂载备份；用户显式
  配置其它 `catalog.remoteUrl` 时尊重其选择，不静默切换）。
- `syncCatalog` 主源失败（非 2xx 或传输异常）自动重试备份源，并记录实际同步源
  `lastSyncUrl` 与是否回退 `lastUsedFallback`，状态层与 `status` 命令可见。

## [0.7.0] - 2026-08-25

### Changed

- 内置默认远程目录源切换到 `config.freetokenbox.com`（自有 Cloudflare 自定义域名）。

## [0.6.0] - 2026-08-25

### Added

- SenseNova re-pointed to the new `token.sensenova.cn/v1` endpoint with a
  real key: live-probed 6 models, verified free tier = `sensenova-6.8-flash-lite`,
  `sensenova-6.7-flash-lite`, `deepseek-v4-flash` (declared via `freeModels`;
  u1 series 404s, `glm-5.2` needs workspace quota). `deepseek-v4-flash` now
  has three free providers (opencode / b-ai / sensenova) for cross-provider
  failover under the generic name.
- Panel: the per-provider 删除 button is gone (upstreams are managed via
  `freeroute.json` / remote catalog). The key field is masked by default — a
  read-only `••••••` password box when configured (not editable until 显示),
  an editable box when not yet configured. Clicking 显示 toggles the editor
  open and prefills the FULL configured key ring, one key per line, straight
  into the editable textarea (empty ring for no-auth upstreams; only prefills
  when the editor is empty, so in-progress typing is never overwritten). The
  key ring is fetched via the `freeroute.get-keys` RPC and cached until
  re-saved. Header info line (端点/默认/请求统计) wraps naturally instead of
  one long clipped line.
- Advanced settings: the 远程目录（JSON）card is reordered — config-file
  path and its one-line note are split into two separate lines, and the JSON
  example block now sits directly under the URL form, with the sync status
  (尚未同步…) and the field explanation (apikey / freeModels / proxy) moved
  below it as individual wrapped lines instead of one long paragraph.
- Key field: saving a new key now returns the row straight to the masked
  hidden state (previously it stayed in the revealed editor).
- Multi-key rotation now surfaces per-key failures in the panel: when a key
  dies with AUTH / rate-limit mid-rotation, the upstream card warns
  「第 N 把 Key 失效(CODE)，已自动轮换」 (absolute key number, not the
  rotation cursor), via the new `health.keyFails` list in `freeroute.state`.


- OpenRouter onboarded with a real key: 21 zero-cost models discovered
  (19 `:free` + `openrouter/free` + `stealth/ox-alpha` via the
  `freeModels` declaration in `freeroute.json`); verified streaming
  through the plugin (`nvidia/nemotron-3.5-lightning:free`,
  `stealth/ox-alpha`, auto with failover). Free-tier daily quota is
  ~50 requests without a deposit.
- Renamed the picker entry `Auto（自动故障转移）` → `Auto（自动切换）`.

### Fixed

- Message content passthrough: the adapter only accepted the dsh
  block-array shape (`content: [{type:'text',…}]`) — any plain-string
  content (OpenAI-native shape) was silently flattened to an empty
  string, so upstreams answered an *empty message* with HTTP 200 and
  every test stayed green. Content is now normalized defensively and
  integration section 3c asserts the captured wire body carries the
  actual text (130 checks total).

- Panel polish: model rows keep a single line (id + platform count only);
  a new 详情 toggle on each row reveals name, context window, and the
  provider list (which upstream serves which real model id). The API-key
  field is masked by default with a 显示/隐藏 toggle (masked = password
  input, shown = multi-line editable box). Collapsed 模型/高级设置 cards
  no longer render a stray bottom border.
- Configuration now persists to a standalone JSON file
  (`~/.dsh/freeroute.json`, override with `FREEROUTE_CONFIG`): existing
  settings.yaml `free-proxy` state is migrated automatically on first
  boot, the file can be copied/edited/replaced for migration (changes are
  hot-reloaded within ~5s via mtime check in `state`), writes are atomic
  (tmp+rename), and secrets never land in it. An optional `keys` object
  (`{"upstream-id": ["sk-a","sk-b"]}`) imports credentials once — only
  into empty slots, never overwriting saved keys. The path is surfaced in
  高级设置.
- Removed the per-provider 清除 (clear-key) button from the panel.

### Fixed

- `sanitizeConfig` silently stripped the per-upstream `proxy` and
  `freeModels` fields from user settings — the B.AI proxy configured in
  `free-proxy.upstreams['b-ai'].custom` never actually reached curl, and
  earlier green E2E runs were carried by `NODE_USE_ENV_PROXY` alone. Both
  fields now survive the settings schema, verified end to end.

- Model lists now show **free AND usable models only**: the picker and the
  panel exclude paid models and models from upstreams without a usable
  credential (nothing you could not actually run). Explicit dispatch by
  generic name or `upstream/model` still reaches every indexed model, so
  nothing becomes unroutable — it just stops cluttering the selector.
- Integration coverage for per-upstream `proxy` argv passthrough and
  `freeModels` declaration marking (new section 3b, 117 checks total).
- b.ai E2E now asserts every b-ai curl invocation carries `--proxy` after
  the config layer, catching regressions the env-proxy harness used to mask.

### Fixed

- `sanitizeConfig` silently stripped the per-upstream `proxy` and
  `freeModels` fields from user settings — the B.AI proxy configured in
  `free-proxy.upstreams['b-ai'].custom` never actually reached curl, and
  earlier green E2E runs were carried by `NODE_USE_ENV_PROXY` alone. Both
  fields now survive the settings schema, verified end to end.

- Built-in `B.AI` provider (`api.b.ai/v1`, signup link carries the invite code
  `chat.b.ai/chat?invite_code=…`): 4 free models verified live with a real key
  (`deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`, `hy3`, `mimo-v2.5`).
  Generic free-model discovery: on B.AI the free tier does not carry a `-free`
  name suffix, and paid models on a zero-balance account answer
  `access_denied: Deposit required` — so free lists are now declared
  explicitly via a `freeModels` array on the builtin entry, a remote-catalog
  entry, or per-upstream custom config, and the probe applies the declared
  marks BEFORE truncating the paid tail (the B.AI free models sit at positions
  31+ of 42 and were previously cut). Paid-vs-free exploration for such
  providers belongs on the catalog server, which the plugin re-syncs every
  30 minutes.
- Per-upstream `proxy` support (builtin/catalog/custom): appended to every
  curl invocation for that upstream (models probe + chat). B.AI is not
  directly reachable from mainland networks; this machine is configured with
  `http://127.0.0.1:7890` via user settings.

- Catalog-is-truth model refresh (free tiers rotate constantly): once a probe
  has returned a model list it becomes the ONLY source for that upstream (the
  static builtin table demotes to a seed for endpoints without `/models`, like
  SenseNova). Refresh triggers: every 10 minutes (forced re-probe of all
  enabled upstreams), on any model-level SERVER dispatch failure (e.g.
  "Model is unavailable", debounced to once per upstream per minute), and on
  key save. Learned default models that vanish from a fresh catalog are
  dropped automatically, so the next request picks from the new list.
- Multi-key rotation per upstream: paste several keys separated by newlines or
  commas - they are stored as `KEY` / `KEY_2` / … / `KEY_8` (multiple accounts
  per vendor is the norm for free quotas). AUTH or RATE_LIMIT failures rotate
  to the next key with a key-level cooldown (30 min for auth, 5 min for rate
  limit) without touching upstream health; the cursor advances on success to
  spread quota evenly. The panel shows a `Key ×N` badge; `set-key` replaces
  the whole ring, `clear-key` unsets all of it.
- `auto` now prefers same-model cross-vendor rotation: if vendors A and B both
  provide `deepseek-3.5-flash`, A's copy failing fails over to B's copy of the
  SAME model first; other models are only tried after every vendor of the
  current model is unavailable.
- Model-level failover: when a specific model on an upstream fails (e.g.
  OpenCode's catalog listing a `-free` model the provider then refuses with
  "Model is unavailable"), `auto` and the connectivity test now try up to 2
  backup free models on the SAME upstream before declaring it dead. The last
  model that actually streamed is learned per upstream and becomes the new
  default (in-memory, re-learned each session); cooldown only engages once
  every model of that upstream has failed. The test button reports which model
  worked and how many were tried.

### Fixed

- Web panel crashed with `Cannot read properties of undefined (reading
  'requests')`: the static client's Connection carrier did not unwrap the
  Typert `{ ok: true, value }` envelope, so the raw envelope was stored as
  state. The carrier now returns `envelope.value` (same pattern as
  dsh-refine), and the panel guards the state shape - any unexpected shape
  degrades to a friendly error card instead of taking down the settings slot.
  Latent since the Typert carrier was introduced; surfaced only after the
  `/api/freeroute/*` 404 fix made the endpoint reachable.
- Host half started before `settings`/`credentials`/`subprocess` were active
  and snapshotted them as `undefined` forever (`persistence: false`, no
  `/freeroute/v1` endpoint, no `/freeproxy` command, key saves could not
  persist). These are now hard `inject` dependencies (apply waits for them);
  `webServer`/`commands` late-bind self-healing (re-read + one-time
  registration retried on every tick and state read); `agentDefaultModel` is
  read at call time.
- HTTP 403 from an upstream now carries an actionable hint (key recognized but
  no permission for that model: enable it in the provider console / complete
  real-name verification). Verified against SenseNova: their compatible-mode
  endpoint has no `/models` (404, probe failure is normal there) and returns
  401 without a key, so a 403 with a configured key is an account-side
  authorization issue, not a transport bug.

### Changed

- OpenCode Zen builtin catalog re-ordered by a live 2026-08-25 probe of all 8
  free models with a real key: `x-preview-f-free` and `hy3-free` proved the
  most stable (new default `x-preview-f-free`); `mimo-v2.5-free` works but
  its free usage limit fills quickly; the nemotron models flap between OK and
  5xx; `deepseek-v4-flash-free` and `laguna-s-2.1-free` were dead upstream;
  `muse-spark-1.2-contributor-free` is region-locked (403). The Go
  subscription endpoint (`zen/go/v1`) is a separate paid tier and is not used.
- Settings panel follow-up round: the 已接管 badge is now live-derived from the
  actual default-model selection, and switching 自动接管 off restores the
  pre-takeover default (re-enabling re-takes-over). Provider rows carry the
  enable switch and icon-only ↑/↓ reorder controls inline; the detail editor
  slimmed down to a full-width multi-key textarea + one bottom action row
  (删除 · 测试连通 · 探测模型 · 保存 · 清除, with the 申请 Key / 申请教程
  links appended at the row's far right in small text), dropping the stats/note
  prose. The model list is now foldable and read-only (no per-row default
  selection, `auto` hidden). 高级设置 keeps only the remote catalog JSON
  config - the custom-upstream form was removed in favor of the catalog, which
  now also accepts a minimal entry shape (bare array or `{upstreams:[…]}`)
  with all-English field names:

  ```json
  [{ "providerName": "OpenCode Zen",
     "getkey": "https://opencode.ai/zen",
     "tutorial": "https://your.site/opencode-tutorial",
     "api": "https://opencode.ai/zen/v1",
     "apikey": ["sk-xxx", "sk-yyy"] }]
  ```

  `tutorial` becomes a real link on the panel (the old Chinese field name
  still parses for compatibility); an optional `apikey` array is imported
  wholesale into the provider's key ring on every sync (multi-key rotation),
  while entries without it leave panel-saved keys untouched; entries without
  a model list simply probe their `/models` after sync.
- Settings panel (设置 -> 模型 -> 免费) rebuilt around the native dsh
  "list core info, click for detail" pattern: a compact header (`freeroute`
  + version tag, endpoint / default / request stats in one muted line, and
  the former 一键集成 card collapsed into an 自动接管 switch beside the
  title); the 原理 intro card is gone. Providers render as an accordion
  list - each row shows only status dot, name, and key meta (free count,
  key ring size, cooldown, probe time); clicking expands the detail editor:
  enable switch, 申请 Key / 申请教程 as plain links (tutorial steps move to
  the link tooltip), multi-key textarea, 测试连通 / 探测模型, stats, and
  reorder controls. Built-in/remote/custom badges and `#N` priority labels
  were dropped - list order is the dispatch order. The model list now sets
  the default by clicking the row itself (radio-style marker instead of a
  per-row button), and low-frequency config (remote catalog, custom
  upstreams) folds into a collapsed 高级设置 row.
- Settings -> 模型 in-page interaction redesigned to mirror Settings -> 插件:
  the title and intro stay in place and a **默认 | 免费** tab bar is inserted
  right below the intro (underline tabs, ARIA roles, arrow-key navigation,
  visited panels stay mounted to preserve polling and form state - all
  matched to the host plugins-page implementation). 默认 keeps the stock
  model settings component; 免费 hides the stock content below the bar and
  shows the freeroute panel in its place. Replaces the previous title-adjacent
  免费 button + self-drawn provider row + modal design.
- Composer model picker (host `listModels` order is the display order): models
  are exposed under GENERIC ids - `deepseek-chat-v3-0324`, not
  `openrouter/deepseek/deepseek-chat-v3-0324:free` - so what you pick never
  shows internal routing. The freeroute group is one deduplicated block:
  `auto` first, then free models, then paid/probed ones. There is no emoji
  prefix anywhere (picker rows have no style slot; the description line is the
  highlight channel): free rows read 「免费模型 · N 家上游 · 失效自动切换」 and
  the group title is `FreeRoute 免费模型`. Internally an alias table records,
  per generic id, every platform offering it (upstream + raw model id);
  dispatch walks that table in upstream-priority order and fails over
  automatically, so picking e.g. `deepseek-v3.2` tries every platform that
  provides it. Legacy composite selections (`opencode/x-free`) still resolve.

- `LlmAdapter.prepareCall` implemented (mirrors the official base-class
  default): binds same-generation model metadata to the dispatch entry
  point. Without it, real sessions failed with
  `registration.adapter.prepareCall is not a function` - the integration
  rig's mock `llm` never called it, so the gap was invisible to the suite
  (now covered by three assertions).

## [0.5.0] - 2026-08-24

FreeRoute now lives inside dsh's built-in 模型 (models) settings page -
the standalone freeroute settings tab is gone.

### Added

- 设置 -> 模型 页内嵌：一个「免费」按钮紧跟页标题「模型」之后（类名从页
  面既有按钮抓取，风格与设置弹窗交互一致），一条 FreeRoute 免费模型配置行
  插在 DeepSeek 等既有提供方行的上方（provider: freeroute · 默认模型 auto
  自动路由 · 状态点显示就绪上游数；只有「编辑」没有「删除」）。两者都会弹
  出模态弹窗承载完整 freeroute 面板（ESC / 遮罩点击关闭）。实现上仍是对内
  置 models 条目的可逆换血（单属性替换 `entry.component`），叠加 DOM 装饰：
  按钮与行的结构类名均从页面活 DOM 克隆，导航始终只有一行「模型」；插件停
  止时还原组件并移除全部装饰节点。宿主没有可包装的 models 条目时退回独立
  freeroute 设置页，面板永远可达。
- Readiness re-checks immediately on settings changes and key save/clear (the
  8s poll stays as the safety net), so auto-takeover of the default model
  (`freeroute/auto`) lands without waiting for the next tick.

### Changed

- The host no longer declares itself through `llm.registerConfigurableProviders`:
  the directory row rendered below DeepSeek with a dead-end editor, and would
  have duplicated the client-drawn row. Provider presence on the models page is
  now entirely client-rendered by the wrapper (position, edit action, and
  readiness dot all under plugin control).
- The previous standalone freeroute settings section (nav sibling of 模型) is
  removed; its panel is the one the 免费 button / row edit opens.

## [0.3.0] - 2026-08-24

Provider renamed and rebuilt around the three requested upstreams (engine
version 0.4.0).

### Changed

- Provider id is now `freeroute` (was `free-router`): the composer model
  picker groups everything under a single **freeroute** provider.
- Builtin upstreams reduced to the three requested: **OpenCode Zen**
  (`opencode.ai/zen/v1`, public model list, `-free` suffix models),
  **OpenRouter**, and **SenseNova** (`api.sensenova.cn/compatible-mode/v1`).
  All previous upstreams remain available through the remote catalog.
- Settings tab relabeled to **freeroute** with order 11 — it sits directly
  below the built-in 模型 (models) settings page in the navigation (dsh
  settings pages are flat `settings.section` entries; there is no sub-tab
  slot inside the models page itself).

### Added

- Model probing: `GET <baseUrl>/models` (OpenAI format) merges each
  upstream's full usable model list on top of the free-only static catalog;
  free models (opencode `-free`, openrouter `:free`) sort first and carry a
  免费 badge. Probes run at startup, on every catalog refresh, after each
  key save, and manually via the 探测模型 button (`freeroute.probe` RPC).
- `defaultModel` now falls back to the first free model when the configured
  default disappears from the merged list.

## [0.2.0] - 2026-08-21

Complete rewrite as a multi-upstream aggregation proxy (engine version 0.3.1,
ported from the battle-tested dynamic-plugin body with a 65-assertion
integration suite).

### Added

- `free-router` model provider with transparent failover **before the first
  token** (empty-response detection included; post-output failures surface).
- Eight builtin free-tier upstreams (OpenRouter / Groq / Google AI Studio /
  SiliconFlow / Zhipu / ModelScope / Cerebras / Mistral) with per-upstream
  signup tutorials, key storage via the credentials service, enable/priority
  controls, connectivity tests, and health/stats.
- Class-based cooldowns: auth/config 10 min, rate-limit 60 s, others
  exponential backoff capped at 10 min.
- Remote catalog: JSON on Cloudflare Pages/R2 (native format or models.dev
  `api.json`, zero-cost models auto-filtered), auto-refresh, user-configurable
  URL — ship new upstream lists without releasing the plugin.
- Custom upstreams (self-hosted uni-api / new-api / LiteLLM gateways,
  optional no-auth) via a validated patch RPC.
- Settings panel 设置 → 模型 · FreeRoute 免费代理 over a Typert `freeroute`
  Remote namespace + Connection RPC carrier.
- Local OpenAI-compatible endpoint `/freeroute/v1/*` for external tools.
- Auto-takeover: saves `free-router/auto` as default once any upstream is
  ready (once per process, opt-out).
- `/freeproxy` text status command.

### Removed

- v0.1 `/free` command and OpenRouter-only rotation logic (superseded by the
  provider adapter; rotation now happens per-request inside the adapter).

## [0.1.0] - 2026-08-21

### Added

- `/free` command: `status` / `list` / `use <id>` / `rotate` / `reset`.
- Live OpenRouter free-model discovery (public `/api/v1/models` endpoint,
  `:free` ids only, 1h cache, sorted by context length).
- Free-first default: `use`/`rotate` rewrite the `agent-default-model`
  settings user layer.
- Rate-limit watcher on `agent/request-error`: marks the active free model
  exhausted on 429-class failures and rotates the default.
- Zero runtime dependencies; missing host services degrade to guidance.

[0.5.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.5.0
[0.3.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.3.0
[0.2.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.2.0
[0.1.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.1.0
