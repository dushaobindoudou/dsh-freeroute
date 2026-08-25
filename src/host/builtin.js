// 内置三上游：目录默认收录各家免费模型；配好 Key 后插件还会探测
// GET <baseUrl>/models 合并出完整可用模型列表（见 probeModels）。
const BUILTIN_UPSTREAMS = [
  {
    id: 'opencode', name: 'OpenCode Zen',
    baseUrl: 'https://opencode.ai/zen/v1', keyRef: 'FREEROUTE_OPENCODE_API_KEY',
    signupUrl: 'https://opencode.ai/zen',
    note: '模型列表公开可探测（无需 Key）；“-free”后缀模型免费。',
    // 默认序为 2026-08-25 实测稳定性排序：x-preview-f-free / hy3-free 多轮
    // 全程稳定；mimo-v2.5-free 快但免费额度易打满（FreeUsageLimit）；
    // nemotron 系间歇 503/400；deepseek-v4-flash-free / laguna-s-2.1-free 当时
    // 上游不可用；muse-spark 有地区限制（403）。探测（目录即真相）+ 模型级
    // 失败转移会自动绕开瞬时不可用，这里只影响首选拍序。
    defaultModel: 'x-preview-f-free',
    models: [
      { id: 'x-preview-f-free', name: 'X Preview (free)', contextWindow: 131072 },
      { id: 'hy3-free', name: 'Hunyuan 3 (free)', contextWindow: 131072 },
      { id: 'mimo-v2.5-free', name: 'MiMo v2.5 (free)', contextWindow: 131072 },
      { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning (free)', contextWindow: 131072 },
      { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (free)', contextWindow: 131072 },
      { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (free)', contextWindow: 131072 },
      { id: 'laguna-s-2.1-free', name: 'Laguna S 2.1 (free)', contextWindow: 131072 },
      { id: 'muse-spark-1.2-contributor-free', name: 'Muse Spark 1.2 Contributor (free)', contextWindow: 131072 }
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
      { id: 'deepseek-v4-flash-vision-exp', name: 'DeepSeek V4 Flash Vision Exp', contextWindow: 131072 },
      { id: 'hy3', name: 'Hunyuan 3', contextWindow: 131072 },
      { id: 'mimo-v2.5', name: 'MiMo v2.5', contextWindow: 131072 }
    ]
  },
  {
    id: 'openrouter', name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1', keyRef: 'FREEROUTE_OPENROUTER_API_KEY',
    signupUrl: 'https://openrouter.ai/settings/keys',
    note: '聚合网关，“:free”后缀模型免费；未充值账户约 50 次/天。',
    defaultModel: 'deepseek/deepseek-chat-v3-0324:free',
    models: [
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', contextWindow: 163840 },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (free)', contextWindow: 163840 },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', contextWindow: 131072 },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (free)', contextWindow: 1048576 },
      { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen2.5 72B (free)', contextWindow: 32768 }
    ]
  },
  {
    id: 'sensenova', name: 'SenseNova 商汤日日新',
    baseUrl: 'https://token.sensenova.cn/v1', keyRef: 'FREEROUTE_SENSENOVA_API_KEY',
    signupUrl: 'https://console.sensenova.cn',
    note: 'OpenAI 兼容端点（token.sensenova.cn）。6.7/6.8-flash-lite 与 deepseek-v4-flash 实测免费；目录中的 u1 系列实际 404。',
    defaultModel: 'sensenova-6.8-flash-lite',
    freeModels: ['sensenova-6.8-flash-lite', 'sensenova-6.7-flash-lite', 'deepseek-v4-flash'],
    models: [
      { id: 'sensenova-6.8-flash-lite', name: 'SenseNova 6.8 Flash Lite', contextWindow: 262144 },
      { id: 'sensenova-6.7-flash-lite', name: 'SenseNova 6.7 Flash Lite', contextWindow: 262144 },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 1048576 }
    ]
  }
]

const TUTORIALS = {
  opencode: ['打开 opencode.ai/zen 注册/登录（支持 GitHub 登录）', '在 Zen 页面生成 API Key', '复制密钥粘贴到上方输入框保存', '带 -free 后缀的模型免费；其余为探测到的付费可用模型'],
  openrouter: ['打开 openrouter.ai 注册/登录（支持 GitHub 登录）', '进入 Settings → Keys，点 Create Key', '复制密钥（sk-or-v1-…）粘贴到上方输入框保存', '选 id 带 :free 的模型即免费；未充值约 50 次/天，用完自动切其他上游'],
  'b-ai': ['打开 chat.b.ai 注册/登录（点面板上的邀请链接注册，双方各得额度）', '在个人设置 / API 页面生成 API Key', '复制密钥粘贴到上方输入框保存', 'deepseek-v4-flash / hy3 / mimo-v2.5 等 4 个模型免费可用；大陆网络通常需在配置里给该上游设 proxy'],
  sensenova: ['打开 console.sensenova.cn 注册（商汤日日新）', '进入 API Key 管理创建密钥', '复制密钥粘贴到上方输入框保存', 'sensenova-6.8/6.7-flash-lite 与 deepseek-v4-flash 实测免费；glm-5.2 需工作区配额，u1 系列不可用']
}

const KNOWN_BASE = {
  opencode: 'https://opencode.ai/zen/v1',
  sensenova: 'https://api.sensenova.cn/compatible-mode/v1',
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

