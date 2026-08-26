# Changelog

All notable changes to this project are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/).

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
  settings user layer via `settings.merge`.
- Rate-limit watcher on `agent/request-error`: marks the active free model
  exhausted on 429-class failures and rotates the default (turn/session
  boundary granularity — the dsh loop does not support mid-request provider
  switching).
- Zero runtime dependencies; missing host services degrade to guidance.

[0.5.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.5.0
[0.3.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.3.0
[0.2.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.2.0
[0.1.0]: https://github.com/dushaobindoudou/dsh-freeroute/releases/tag/v0.1.0
