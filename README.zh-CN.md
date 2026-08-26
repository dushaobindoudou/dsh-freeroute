# dsh-freeroute

[English](README.md) | **简体中文**

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/0xrushmoon/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/0xrushmoon/dsh-freeroute/actions/workflows/ci.yml)

[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（dsh）的
免费模型聚合代理：注册 `freeroute` 模型提供方，聚合多家免费额度上游
（OpenCode Zen / B.AI / OpenRouter / SenseNova 四家内置，
外加远程目录与自定义网关；其余厂商经远程目录接入）。配好任意一家 API Key 即可用；上游失效
时在**出字前**自动切换，对会话透明；另提供本地 OpenAI 兼容端点。

> "免费"指**各家正规的免费额度**，密钥由你自己注册提供。本插件不做共享号池，
> 也不会绕过付费 API。

## 密钥管理

- **多 Key 轮换**：免费额度按账号计，每个上游支持最多 8 把 Key（编辑框里
  用换行/逗号分隔，或环境变量 `KEY_2`…`KEY_8`）。鉴权 / 限流失败只冷却
  这一把 Key 并自动换下一把，不会连累上游整体；成功后游标前移，免费配额
  在多账号间均匀分摊。
- **默认掩码**：密钥框隐藏态是不可编辑的 `••••••` 掩码，点「显示」才打开
  编辑器并预填完整 Key 环（一行一把，可直接编辑）；保存后自动回到掩码态。
  密钥只经 credentials 服务存取，绝不以明文写入配置。
- **失效可见**：轮换中检测到某把 Key 失效时，面板会提示
  **「第 N 把 Key 失效」**（哪一把、什么原因），坏账号一眼可见，不必翻日志。

## 原理

1. **适配器注册**：`llm.registerAdapter(['freeroute'], adapter)` 注册成 dsh
   模型路由。模型选择器出现 `freeroute/auto`（自动故障转移）与
   `freeroute/<上游id>/<模型id>`（指定模型）。
2. **请求翻译**：dsh 内部消息 ⇄ OpenAI Chat Completions SSE；reasoning、
   tool_calls、usage 全量透传。密钥只经 credentials 服务存取。
3. **健康与故障转移**：失败按类别冷却（鉴权/配置 10 分钟、限流 60 秒、
   其他指数退避封顶 10 分钟）。`auto` 按优先级选「已启用、已配 Key、未冷却」
   的上游；未出字的请求失败即切下一家（含空响应检测），已出字的直接抛错。
   Key 在鉴权/限流失败时单独轮换，并把失效的那一把提示到面板。
4. **配置三层合成**：内置目录 → 远程目录（Cloudflare 托管 JSON，免发版更新；
   兼容 native 格式与 models.dev `api.json`，自动筛 0 成本模型）→ 用户 patch
   （`free-proxy` 设置命名空间持久化）。
5. **本地端点**：`/freeroute/v1/chat/completions` + `/freeroute/v1/models`，
   任意 OpenAI 工具指向它即用同一套免费池。
6. **全局代理（默认关闭）**：`设置 → 模型 → 免费 → 高级设置` 里配置一条
   `http://127.0.0.1:7890` 型代理，所有未单独配置代理的上游（对话请求与
   模型探测）自动走它；上游自定义或目录声明的 `proxy` 优先于全局；远程目录
   同步始终直连。大陆网络用户把 Clash/v2ray 端口填一处即可，无需逐个上游
   配置。

## 设置面板

dsh 内置的 `设置 -> 模型` 页被可逆地包装增强：标题与介绍保持原位，
介绍之后多一排 **「默认 | 免费」页签**（结构对齐「设置 -> 插件」页：下划线页签、aria 角色、方向键导航、访问过的面板保持挂载）：

- **默认**：原有模型设置原样保留；
- **免费**：完整 freeroute 面板——上游卡片（启停 / 优先级 / 申请教程 /
  密钥 / 连通测试 / 健康统计）、一键集成向导、远程目录配置、自定义上游表单
  （可接本地 uni-api / new-api / LiteLLM 自建网关）。

设置导航里没有独立的 freeroute 平级项（仅当宿主没有可包装的模型页时才退回
独立设置页）。`/freeproxy` 命令输出文本状态。

## 让其他 Agent / 工具接入（一直用 auto）

dsh web 启动后，本插件在同一端口上暴露一个 **OpenAI 兼容端点**，任何
支持自定义 base URL 的 agent / 工具都能直接复用这套免费池：

- **Base URL**：`http://127.0.0.1:<dsh web 端口>/freeroute/v1`
  （默认端口 3080；免费面板底部也显示当前完整地址）
- **API Key**：不需要。端点仅监听本机回环；某些工具强制要求非空 Key，
  随便填占位符即可（如 `sk-freeroute`）
- **模型**：填 `auto` 或**干脆不传**（默认就是 auto）——按优先级自动选
  已启用的免费上游，失败 / 限流 / 首 token 中断时全链自动切换，单模型
  失败自动降级为链式 fallback，无需人工干预
- **能力**：`stream`、`tools`（function calling）、`stop`、`temperature`、
  `max_tokens` 均透传；CORS 已开放，浏览器内插件可直连
- **健康检查**：`GET /freeroute/health`；**模型列表**：`GET /freeroute/v1/models`
  （第一项就是 `auto`）

curl 示例（最简，不带 model 即 auto）：

```sh
curl http://127.0.0.1:3080/freeroute/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"你好"}]}'
```

常见工具配置：

| 工具 | 配置 |
|---|---|
| OpenAI SDK | `baseURL: 'http://127.0.0.1:3080/freeroute/v1'`，`apiKey: 'sk-freeroute'`，`model: 'auto'` |
| Codex CLI | `~/.codex/config.toml` 里 model_provider 指向该 base URL（wire_api = "chat"） |
| Cline / Roo / Continue | OpenAI Compatible，Base URL 同上，模型名 `auto` |
| 任意 OpenAI 兼容网关 | 把本端点作为上游挂进 uni-api / new-api / LiteLLM 即可 |

注意：端点随 `dsh web` 进程存活（同机使用）；至少在免费页签给一个上游
配好 Key，auto 链才有可用节点。

## 安装

```sh
dsh plugin --profile web add dsh-freeroute
```

要求：Node.js ≥ 18；宿主提供 `llm` / `timer`；`settings` / `credentials` /
`subprocess` / `webServer` / `commands` / `agentDefaultModel` 缺失时优雅降级。

## 开发

分层源码（详见 `src/README.md`）：

- `src/` 是唯一手改入口，按层拆片：`src/host/`（20 片：常量 → 目录解析 →
  上下文/状态 → 密钥/探测/模型/健康 → 传输/路由/HTTP → 接管/RPC/命令/端点/
  启动）、`src/client/`（10 片：样式/上下文 → 面板状态/头部/上游/高级/模型 →
  模型页/集成/插件尾）。
- `npm run build:dynamic` 把 `src/**` 装配成 `freeroute-dynamic/
  {host,client}.js`（动态加载器要求的单函数体形态，版本号从 package.json
  注入）。
- `freeroute-dynamic/` 带集成测试 137 项：
  `node freeroute-dynamic/test/integration.mjs`。
- `npm run build:static` 从装配产物机械生成 `lib/`（RPC 层替换为 Typert
  Remote + Connection 载体），请勿只手改一侧；`build:static` 会先跑
  `build:dynamic`。
- `npm run lint && npm test`：lint + 真实 cordis 根上的冒烟测试。
- **模块同一性**：`@deepseek-ai/dsh-typert-protocol` 必须与 dsh 宿主解析到
  同一份物理副本。宿主网关从它自己那份模块私有的 WeakMap 读取 Remote 方法
  标记；插件 workspace 自带 pnpm 副本时标记记进了另一份 WeakMap，网关一个
  方法都扫不到，`/api/freeroute/*` 静默注册不上（客户端看到 `HTTP 404`，
  服务端无任何报错）。v0.7.3 起 `lib/index.js` 在加载时直接锚定宿主自己的
  副本（运行中的 dsh CLI 入口 → 全局 npm 布局 → 回退），不再依赖 postinstall、
  软链或宿主版本。旧版本若出现
  `transport failure for /api/freeroute/state: HTTP 404`，升级到 ≥0.7.3
  即永久修复。

## 诚实的边界

本插件聚合的是「你自己注册的免费额度」。若需多租户 / 计费 / 渠道管理，
建议自建 [uni-api](https://github.com/yym68686/uni-api)、new-api 或 LiteLLM，
再把它的地址作为本插件的自定义上游接入——两者互补，不重复造轮子。

### Web 面板（可选）

`lib/client.js` 会在 `dsh web` 设置里注册「免费模型」分区，排行与命令
一致，点击即设默认。dsh 的 web 前端是预构建产物，面板需要在
dsh-web-frontend 的 client bundle 里加入本包并重新构建才会出现；
`free-models-preview.html` 是独立镜像预览（把仓库根目录起个 HTTP 服务
再打开即可），无需重新构建前端。

## License

[MIT](LICENSE) © dushaobindoudou
