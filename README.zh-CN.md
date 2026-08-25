# dsh-freeroute

[English](README.md) | **简体中文**

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/dushaobindoudou/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/dushaobindoudou/dsh-freeroute/actions/workflows/ci.yml)

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

## 设置面板

dsh 内置的 `设置 -> 模型` 页被可逆地包装增强：标题与介绍保持原位，
介绍之后多一排 **「默认 | 免费」页签**（结构对齐「设置 -> 插件」页：下划线页签、aria 角色、方向键导航、访问过的面板保持挂载）：

- **默认**：原有模型设置原样保留；
- **免费**：完整 freeroute 面板——上游卡片（启停 / 优先级 / 申请教程 /
  密钥 / 连通测试 / 健康统计）、一键集成向导、远程目录配置、自定义上游表单
  （可接本地 uni-api / new-api / LiteLLM 自建网关）。

设置导航里没有独立的 freeroute 平级项（仅当宿主没有可包装的模型页时才退回
独立设置页）。`/freeproxy` 命令输出文本状态。

## 安装

```sh
dsh plugin --profile web add dsh-freeroute
```

要求：Node.js ≥ 18；宿主提供 `llm` / `timer`；`settings` / `credentials` /
`subprocess` / `webServer` / `commands` / `agentDefaultModel` 缺失时优雅降级。

## 开发

- `freeroute-dynamic/`：同一逻辑的动态插件源（host.js / client.js），集成
  测试 137 项：`node freeroute-dynamic/test/integration.mjs`。
- `npm run build:static` 从动态源机械生成 `lib/`（RPC 层替换为 Typert
  Remote + Connection 载体），请勿只手改一侧。
- `npm run lint && npm test`：lint + 真实 cordis 根上的冒烟测试。
- **模块同一性**：`@deepseek-ai/dsh-typert-protocol` 必须与 dsh 宿主解析到
  同一份物理副本。workspace 自带 pnpm 副本时，Typert Remote marker 类与宿主
  不同源，`/api/freeroute/*` 全部注册不上（客户端看到 `HTTP 404`）。
  `postinstall` 会执行 `scripts/link-host-typert.mjs`，把 workspace 的该包
  软链到全局 dsh 安装内的那份（同 dsh-refine 的做法）。若安装后再次出现
  `transport failure for /api/freeroute/state: HTTP 404`，运行
  `node scripts/link-host-typert.mjs` 并重启 `dsh web` 即可。

## 诚实的边界

本插件聚合的是「你自己注册的免费额度」。若需多租户 / 计费 / 渠道管理，
建议自建 [uni-api](https://github.com/yym68686/uni-api)、new-api 或 LiteLLM，
再把它的地址作为本插件的自定义上游接入——两者互补，不重复造轮子。

## License

[MIT](LICENSE) © dushaobindoudou
