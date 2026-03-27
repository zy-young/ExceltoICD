/**
 * 模型提供商配置
 * 支持多种 LLM API 提供商
 */

export interface ModelProvider {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  authType: 'bearer' | 'custom';
  models: ModelInfo[];
  defaultModel: string;
  requiresSDK?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextLength?: number;
}

/**
 * 支持的模型提供商列表
 */
export const MODEL_PROVIDERS: Record<string, ModelProvider> = {
  coze: {
    id: 'coze',
    name: 'Coze',
    description: 'Coze 平台集成的模型，使用 Coze API Key（JWT 格式）',
    baseUrl: 'https://api.coze.com/v1',
    authType: 'bearer',
    requiresSDK: true,
    defaultModel: 'deepseek-v3-2-251201',
    models: [
      { id: 'deepseek-v3-2-251201', name: 'DeepSeek V3', description: '高性能大模型，适合复杂任务', contextLength: 64000 },
      { id: 'doubao-seed-1-8-251228', name: '豆包 Seed 1.8', description: '字节跳动轻量级模型，响应速度快', contextLength: 32000 },
      { id: 'doubao-1-5-pro-32k-250115', name: '豆包 1.5 Pro 32K', description: '字节跳动旗舰模型', contextLength: 32000 },
      { id: 'doubao-pro-32k', name: '豆包 Pro 32K', description: '字节跳动高性能模型', contextLength: 32000 },
      { id: 'doubao-lite-32k', name: '豆包 Lite 32K', description: '字节跳动轻量模型', contextLength: 32000 },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek 官方 API，使用 DeepSeek API Key（sk- 开头）',
    baseUrl: 'https://api.deepseek.com',
    authType: 'bearer',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', description: '最新通用对话模型（DeepSeek-V3）', contextLength: 64000 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: '推理模型（DeepSeek-R1）', contextLength: 64000 },
    ],
  },
  qwen: {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问 API，使用 DashScope API Key',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'bearer',
    defaultModel: 'qwen-plus',
    models: [
      { id: 'qwen-max', name: 'Qwen Max', description: '旗舰模型，最强能力', contextLength: 32000 },
      { id: 'qwen-plus', name: 'Qwen Plus', description: '均衡性能，推荐日常使用', contextLength: 131072 },
      { id: 'qwen-turbo', name: 'Qwen Turbo', description: '高速响应，性价比高', contextLength: 131072 },
      { id: 'qwen-long', name: 'Qwen Long', description: '超长上下文模型', contextLength: 1000000 },
      { id: 'qwen2.5-72b-instruct', name: 'Qwen2.5 72B', description: 'Qwen2.5 开源模型', contextLength: 131072 },
      { id: 'qwen2.5-32b-instruct', name: 'Qwen2.5 32B', description: 'Qwen2.5 中型模型', contextLength: 131072 },
      { id: 'qwen2.5-14b-instruct', name: 'Qwen2.5 14B', description: 'Qwen2.5 轻量模型', contextLength: 131072 },
      { id: 'qwen2.5-7b-instruct', name: 'Qwen2.5 7B', description: 'Qwen2.5 小型模型', contextLength: 131072 },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini API，使用 Google AI Studio API Key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'custom',
    defaultModel: 'gemini-2.0-flash-exp',
    models: [
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp', description: '最新实验版本，性能最强', contextLength: 1048576 },
      { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking', description: '思维链推理模型', contextLength: 32767 },
      { id: 'gemini-exp-1206', name: 'Gemini Exp 1206', description: '实验版旗舰模型', contextLength: 2097152 },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: '稳定版高性能模型', contextLength: 2097152 },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '快速响应模型', contextLength: 1048576 },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', description: '轻量高速模型', contextLength: 1048576 },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 官方 API，使用 OpenAI API Key',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: '多模态旗舰模型', contextLength: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '轻量高速模型', contextLength: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'GPT-4 高速版本', contextLength: 128000 },
      { id: 'gpt-4', name: 'GPT-4', description: 'GPT-4 标准版', contextLength: 8192 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: '经典高性价比模型', contextLength: 16385 },
      { id: 'o1', name: 'o1', description: '推理模型，适合复杂问题', contextLength: 200000 },
      { id: 'o1-mini', name: 'o1-mini', description: '轻量推理模型', contextLength: 128000 },
      { id: 'o1-preview', name: 'o1-preview', description: '推理模型预览版', contextLength: 128000 },
    ],
  },
};

/**
 * 获取所有可用模型
 */
export function getAllModels(): Array<{ provider: string; model: ModelInfo }> {
  const models: Array<{ provider: string; model: ModelInfo }> = [];
  for (const [providerId, provider] of Object.entries(MODEL_PROVIDERS)) {
    for (const model of provider.models) {
      models.push({ provider: providerId, model });
    }
  }
  return models;
}

/**
 * 获取指定提供商的模型
 */
export function getModelsByProvider(providerId: string): ModelInfo[] {
  return MODEL_PROVIDERS[providerId]?.models || [];
}

/**
 * 获取提供商信息
 */
export function getProviderInfo(providerId: string): ModelProvider | null {
  return MODEL_PROVIDERS[providerId] || null;
}

/**
 * 解析模型 ID（格式：providerId/modelId）
 */
export function parseModelId(modelId: string): { providerId: string; modelName: string } | null {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex > 0) {
    return {
      providerId: modelId.slice(0, slashIndex),
      modelName: modelId.slice(slashIndex + 1),
    };
  }
  return null;
}

/**
 * 构建模型 ID
 */
export function buildModelId(providerId: string, modelName: string): string {
  return `${providerId}/${modelName}`;
}
