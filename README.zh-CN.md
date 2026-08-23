# dsh-freeroute

[English](README.md) | **简体中文**

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/dushaobindoudou/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/dushaobindoudou/dsh-freeroute/actions/workflows/ci.yml)

[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（dsh）的
免费档模型路由：发现 [OpenRouter](https://openrouter.ai) 免费模型（`:free`
目录，实时拉取），用可解释的评分排行，让所有模型请求都走最优免费模型，
限流时**在出错的步骤内**自动轮转到下一个。付费配置不被触碰，除非你主动
要求。

> "免费"指**各家正规的免费额度**。本插件不会绕过付费 API。

## 用法

- `/free status` - 接管状态、当前最优、目录新鲜度、冷却中模型、轮转统计
- `/free list [n]` - 免费模型排行，带分数与解释标记
- `/free use <id>` - 把免费模型持久化为 agent 默认（新回合/新会话生效）
- `/free rotate` - 切到最优的未冷却免费模型（持久化）
- `/free on [id]` - **接管模式**：所有模型请求改写到最优免费模型（仅运行
  时；`/free off` 恢复）
- `/free off` - 关闭接管
- `/free test [n]` - 实测 top-N 模型（每个 1 次极小请求）
- `/free refresh` / `/free reset` - 强制刷新目录 / 清空冷却

### 步中轮转

免费模型命中 `RATE_LIMIT` / `QUOTA` / HTTP 429 / 402 时，插件给它打上
冷却标记（默认 10 分钟，尊重 provider 的 `Retry-After`），并向 agent 循环
返回重试决策。重试请求会重新进入 `agent/request` 瀑布，落到下一个最优
免费模型上——出错的步骤自行恢复，用户看不到失败。每回合的轮转预算
（默认 3 次）避免整个目录都被限流时空转。

即使不开接管，你手动选中的免费模型限流后也会以同样方式自愈（免费守卫）。

### 排行规则

先过滤（可对话、支持工具调用、未过期、排除安全审核类模型），再按上下文
长度、输出上限、新鲜度、激活参数量、家族口碑打分。`/free list` 会显示
分数与背后的标记。

## 安装

在 dsh profile（如 `~/.dsh/profiles/web/cordis.yml`）挂载：

```yaml
plugins:
  - dsh-freeroute
```

可选配置：

```yaml
plugins:
  - id: dsh-freeroute
    config:
      takeover: false        # 启动即开启接管
      autoRotate: true       # 免费守卫：自愈被限流的免费模型
      cooldownMinutes: 10    # 耗尽冷却时长
      maxStepRetries: 3      # 每回合轮转重试预算
      minContext: 8000       # 上下文硬下限
      exclude: []            # 模型 id 子串屏蔽列表
```

要求：Node.js ≥ 18；在 dsh 里配置好 OpenRouter provider 的 key（目录本身
从公开端点拉取，不需要 key）。

### Web 面板（可选）

`lib/client.js` 会在 `dsh web` 设置里注册「免费模型」分区，排行与命令
一致，点击即设默认。dsh 的 web 前端是预构建产物，面板需要在
dsh-web-frontend 的 client bundle 里加入本包并重新构建才会出现；
`free-models-preview.html` 是独立镜像预览（把仓库根目录起个 HTTP 服务
再打开即可），无需重新构建前端。

## License

[MIT](LICENSE) © dushaobindoudou
