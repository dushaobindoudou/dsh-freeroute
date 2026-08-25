# FreeRoute 远程目录格式（schema 说明）

本文件由 `freeroute-catalog.json` 的 `$schema` 字段引用，描述远程目录 JSON
的格式约定。把目录 JSON 托管到 Cloudflare Pages/R2/Workers（或任意静态
托管）后，在插件设置里填入其 URL，即可免发版更新免费上游列表。

## 顶层字段

```jsonc
{
  "$schema": "…/schema.md",   // 可选，指向本文件
  "name": "…",                // 可选，目录名（展示用）
  "version": 1,               // 可选，目录格式版本
  "updatedAt": "2026-08-21",  // 可选，最后更新日期
  "upstreams": [ /* 上游数组，一行一个厂商 */ ]
}
```

## upstream 条目字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 上游唯一 id（目录内去重；与用户 patch 里的 key 对齐） |
| `name` | 否 | 展示名 |
| `baseUrl` | 是 | OpenAI 兼容端点（插件拼 `/chat/completions` 与 `/models`） |
| `keyRef` | 否* | 凭据引用名；缺省按 `FREEROUTE_<ID大写>_API_KEY` 推导 |
| `apikey` | 否 | Key 数组（至多 8 把）：同步时整环导入凭据并参与轮换；不写则不动用户已保存的 Key |
| `signupUrl` | 否 | 申请 Key 的入口（面板「申请 Key ↗」） |
| `tutorial` | 否 | 申请教程 URL，或步骤字符串数组（悬停展示） |
| `note` | 否 | 一句话备注（面板行内小字） |
| `proxy` | 否 | 该上游需走代理时填（如 `http://127.0.0.1:7890`） |
| `freeModels` | 否 | 模型名不含 free 字样时，显式声明哪些模型免费 |
| `noAuth` | 否 | 本机免鉴权网关声明（true 时不要求 Key） |
| `defaultModel` | 否 | 首选模型 id |
| `models` | 否 | 静态模型表 `[{id, name, contextWindow}]`；探测到 `/models` 后以探测为准（目录即真相） |

## 兼容性

- 同一 URL 也兼容 [models.dev](https://models.dev) 的 `api.json` 格式
  （`providers` 对象），0 成本模型自动视作免费。
- 面板「高级设置 -> 远程目录（JSON）」里有完整示例；`~/.dsh/freeroute.json`
  的 `keys` 字段可一次性导入密钥（仅补空位，永不回写文件）。
