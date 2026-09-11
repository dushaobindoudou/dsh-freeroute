// 内置三上游：目录默认收录各家免费模型；配好 Key 后插件还会探测
// GET <baseUrl>/models 合并出完整可用模型列表（见 probeModels）。
// 种子表口径：2026-09-11 live 核对（GET /models 公开可探，无需 Key）。
// 探测（目录即真相）+ 模型级失败转移会自动绕开瞬时不可用，这里只影响
// 首探前的种子与首选拍序。
const BUILTIN_UPSTREAMS = [
  {
    id: 'opencode', name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1', keyRef: 'FREEROUTE_OPENCODE_API_KEY',
    signupUrl: 'https://opencode.ai/zen',
    note: '模型列表公开可探测（无需 Key）；“-free”后缀模型免费。',
    // 2026-09-11 live：7 款现役 -free（hy3-free / x-preview-f-free /
    // laguna-s-2.1-free 均已下线）。mimo-v2.5-free 快但额度易打满
    // （FreeUsageLimit）；muse-spark 贡献者档并发紧；nemotron 系间歇 503。
    defaultModel: 'deepseek-v4-flash-free',
    models: [
      { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (free)', contextWindow: 131072 },
      { id: 'muse-spark-1.3-contributor-free', name: 'Muse Spark 1.3 Contributor (free)', contextWindow: 131072 },
      { id: 'muse-spark-1.2-contributor-free', name: 'Muse Spark 1.2 Contributor (free)', contextWindow: 131072 },
      { id: 'mimo-v2.5-free', name: 'MiMo v2.5 (free)', contextWindow: 131072 },
      { id: 'ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash Fin (free)', contextWindow: 131072 },
      { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning (free)', contextWindow: 131072 },
      { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (free)', contextWindow: 131072 }
    ]
  },
  {
    id: 'b-ai', name: 'B.AI',
    baseUrl: 'https://api.b.ai/v1', keyRef: 'FREEROUTE_BAI_API_KEY',
    signupUrl: 'https://chat.b.ai/chat?invite_code=2PLTB4',
    note: '注册送额度，4 个免费模型无需充值；大陆网络通常需 HTTP 代理（上游可配 proxy 字段）。',
    defaultModel: 'deepseek-v4-flash',
    // 这批模型名不含 “free”，用 freeModels 显式声明（服务端目录可随时改）
    freeModels: ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'hy3', 'mimo-v2.5'],
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 131072 },
      { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', contextWindow: 131072, inputModalities: ['text', 'image'] },
      { id: 'hy3', name: 'Hunyuan 3', contextWindow: 131072 },
      { id: 'mimo-v2.5', name: 'MiMo v2.5', contextWindow: 131072 }
    ]
  },
  {
    id: 'openrouter', name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1', keyRef: 'FREEROUTE_OPENROUTER_API_KEY',
    signupUrl: 'https://openrouter.ai/settings/keys',
    note: '聚合网关，“:free”后缀模型免费；未充值账户约 50 次/天。',
    // 2026-09-11 live 免费档种子（GET /models 公开免鉴权，探到即覆盖）：
    // 视觉模型带 inputModalities，供 dsh 放行图片输入；其余不声明（未知），
    // 图片原样透传由上游裁决。
    defaultModel: 'openrouter/free',
    models: [
      { id: 'openrouter/free', name: 'OpenRouter Free Router', contextWindow: 200000, inputModalities: ['text', 'image'] },
      { id: 'inclusionai/ling-3.0-flash-vl:free', name: 'Ling 3.0 Flash VL (free)', contextWindow: 262144, inputModalities: ['text', 'image'] },
      { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)', contextWindow: 262144, inputModalities: ['text', 'image'] },
      { id: 'dots-studio/dots-3-note-preview:free', name: 'dots-3 Note Preview (free)', contextWindow: 512000, inputModalities: ['text', 'image'] },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)', contextWindow: 262144 },
      { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (free)', contextWindow: 1000000 },
      { id: 'cohere/north-mini-code:free', name: 'North Mini Code (free)', contextWindow: 256000 },
      { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1 (free)', contextWindow: 262144 }
    ]
  },
  {
    id: 'sensenova', name: 'SenseNova 商汤日日新',
    baseUrl: 'https://token.sensenova.cn/v1', keyRef: 'FREEROUTE_SENSENOVA_API_KEY',
    signupUrl: 'https://console.sensenova.cn',
    note: 'OpenAI 兼容端点（token.sensenova.cn；api.sensenova.cn 会 403）。3 款实测免费；官方无 /models 列表，种子表即真相。',
    defaultModel: 'deepseek-v4-flash',
    freeModels: ['sensenova-6.8-flash-lite', 'sensenova-6.7-flash-lite', 'deepseek-v4-flash'],
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1048576 },
      { id: 'sensenova-6.8-flash-lite', name: 'SenseNova 6.8 Flash Lite', contextWindow: 262144 },
      { id: 'sensenova-6.7-flash-lite', name: 'SenseNova 6.7 Flash Lite', contextWindow: 262144 }
    ]
  }
]

const TUTORIALS = {
  opencode: ['打开 opencode.ai/zen 注册/登录（支持 GitHub 登录）', '在 Zen 页面生成 API Key', '复制密钥粘贴到上方输入框保存', '带 -free 后缀的模型免费；其余为探测到的付费可用模型'],
  openrouter: ['打开 openrouter.ai 注册/登录（支持 GitHub 登录）', '进入 Settings → Keys，点 Create Key', '复制密钥（sk-or-v1-…）粘贴到上方输入框保存', '选 id 带 :free 的模型即免费；未充值约 50 次/天，用完自动切其他上游'],
  'b-ai': ['打开 chat.b.ai 注册/登录（点面板上的邀请链接注册，双方各得额度）', '在个人设置 / API 页面生成 API Key', '复制密钥粘贴到上方输入框保存', 'deepseek-v4-flash / hy3 / mimo-v2.5 等 4 个模型免费可用；大陆网络通常需在配置里给该上游设 proxy'],
  sensenova: ['打开 console.sensenova.cn 注册（商汤日日新）', '进入 API Key 管理创建密钥', '复制密钥粘贴到上方输入框保存', 'deepseek-v4-flash 与 sensenova-6.8/6.7-flash-lite 实测免费（2026-09-11）；glm-5.2 需工作区配额，u1 系列不可用']
}

const KNOWN_BASE = {
  opencode: 'https://opencode.ai/zen/v1',
  // token.sensenova.cn 是官方 OpenAI 兼容端点；api.sensenova.cn/compatible-mode
  // 对目录同步与推理均返回 403（2026-09-09 复核），旧值会静默换不来模型。
  sensenova: 'https://token.sensenova.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  zhipuai: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
  modelscope: 'https://api-inference.modelscope.cn/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  novita: 'https://api.novita.ai/v3/openai',
  deepinfra: 'https://api.deepinfra.com/v1/openai'
}

