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
  inputPrice?: number; // per 1K tokens
  outputPrice?: number; // per 1K tokens
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
      {
        id: 'deepseek-v3-2-251201',
        name: 'DeepSeek V3',
        description: '高性能大模型，适合复杂任务',
      },
      {
        id: 'doubao-seed-1-8-251228',
        name: '豆包 Seed 1.8',
        description: '轻量级模型，响应速度快',
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        description: 'OpenAI 旗舰模型',
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'OpenAI 高性价比模型',
      },
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
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        description: '通用对话模型',
        contextLength: 128000,
        inputPrice: 0.001, // ¥ per 1K tokens
        outputPrice: 0.002,
      },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        description: '推理模型，适合复杂逻辑',
        contextLength: 64000,
        inputPrice: 0.001,
        outputPrice: 0.002,
      },
    ],
  },
  qwen: {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云通义千问 API，使用 DashScope API Key',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    authType: 'bearer',
    defaultModel: 'qwen-turbo',
    models: [
      {
        id: 'qwen-turbo',
        name: 'Qwen Turbo',
        description: '高速响应模型',
        contextLength: 8000,
        inputPrice: 0.0008,
        outputPrice: 0.0008,
      },
      {
        id: 'qwen-plus',
        name: 'Qwen Plus',
        description: '均衡性能模型',
        contextLength: 32000,
        inputPrice: 0.004,
        outputPrice: 0.004,
      },
      {
        id: 'qwen-max',
        name: 'Qwen Max',
        description: '旗舰模型',
        contextLength: 32000,
        inputPrice: 0.04,
        outputPrice: 0.04,
      },
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini API，使用 Google AI Studio API Key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authType: 'custom',
    defaultModel: 'gemini-1.5-pro',
    models: [
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Google 高性能模型',
        contextLength: 2800000,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Google 高速模型',
        contextLength: 1000000,
      },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 官方 API，使用 OpenAI API Key',
    baseUrl: 'https://api.openai.com/v1',
    authType: 'bearer',
    defaultModel: 'gpt-3.5-turbo',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'OpenAI 最新旗舰模型',
        contextLength: 128000,
        inputPrice: 0.005,
        outputPrice: 0.015,
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'OpenAI 高性能模型',
        contextLength: 128000,
        inputPrice: 0.01,
        outputPrice: 0.03,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'OpenAI 高性价比模型',
        contextLength: 16385,
        inputPrice: 0.0005,
        outputPrice: 0.0015,
      },
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
  const provider = MODEL_PROVIDERS[providerId];
  return provider?.models || [];
}

/**
 * 获取模型信息
 */
export function getModelInfo(providerId: string, modelId: string): ModelInfo | null {
  const provider = MODEL_PROVIDERS[providerId];
  return provider?.models.find(m => m.id === modelId) || null;
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
  const parts = modelId.split('/');
  if (parts.length === 2) {
    return { providerId: parts[0], modelName: parts[1] };
  }
  return null;
}

/**
 * 构建模型 ID
 */
export function buildModelId(providerId: string, modelName: string): string {
  return `${providerId}/${modelName}`;
}
