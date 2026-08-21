# dsh-freeroute

[English](README.md) | **简体中文**

[![npm version](https://img.shields.io/npm/v/dsh-freeroute.svg?style=flat-square)](https://www.npmjs.com/package/dsh-freeroute)
[![License](https://img.shields.io/npm/l/dsh-freeroute.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/dushaobindoudou/dsh-freeroute/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/dushaobindoudou/dsh-freeroute/actions/workflows/ci.yml)

[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（dsh）的
免费档模型路由：发现 [OpenRouter](https://openrouter.ai) 免费模型（`:free`
目录，实时拉取），把最优免费模型设为 agent 默认，限流时自动轮转到下一个
免费模型。付费配置不被触碰，除非你主动要求。

> "免费"指**各家正规的免费额度**。本插件不会绕过付费 API。

## 用法

- `/free status` — 当前默认、目录数量、耗尽标记、轮转模式
- `/free list` — 实时 OpenRouter `:free` 模型，按上下文长度排序
- `/free use <id>` — 设为 agent 默认模型（新回合/新会话生效）
- `/free rotate` — 切到最优的未耗尽免费模型
- `/free reset` — 清空耗尽标记

免费模型活跃期间收到限流错误（429 等）时，自动标记耗尽并把默认模型轮转
到下一个——dsh 请求循环不支持请求中途换 provider，轮转在下一回合/会话边界
生效。

## 安装

在 dsh profile（如 `~/.dsh/profiles/web/cordis.yml`）挂载：

```yaml
plugins:
  - dsh-freeroute
```

要求：Node.js ≥ 18；在 dsh 里配置好 OpenRouter provider 的 key（目录本身
从公开端点拉取，不需要 key）。

## License

[MIT](LICENSE) © dushaobindoudou
