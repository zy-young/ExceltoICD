/**
 * 统一的 LLM 服务
 * 支持多种模型提供商
 */

import { MODEL_PROVIDERS, ModelProvider, parseModelId } from './model-providers';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

/**
 * 统一的 LLM 服务类
 */
export class LLMService {
  private providerId: string;
  private apiKey: string;
  private provider: ModelProvider;

  constructor(modelId: string, apiKey: string) {
    const parsed = parseModelId(modelId);
    if (!parsed) {
      throw new Error(`Invalid model ID format: ${modelId}`);
    }

    this.providerId = parsed.providerId;
    this.apiKey = apiKey;
    this.provider = MODEL_PROVIDERS[this.providerId];

    if (!this.provider) {
      throw new Error(`Unknown provider: ${this.providerId}`);
    }
  }

  /**
   * 调用 LLM
   */
  async invoke(
    messages: LLMMessage[],
    options: LLMOptions & { model?: string } = {}
  ): Promise<LLMResponse> {
    const model = options.model || this.provider.defaultModel;
    
    switch (this.providerId) {
      case 'coze':
        return this.invokeCoze(messages, { ...options, model });
      case 'deepseek':
        return this.invokeDeepSeek(messages, { ...options, model });
      case 'qwen':
        return this.invokeQwen(messages, { ...options, model });
      case 'gemini':
        return this.invokeGemini(messages, { ...options, model });
      case 'openai':
        return this.invokeOpenAI(messages, { ...options, model });
      default:
        throw new Error(`Unsupported provider: ${this.providerId}`);
    }
  }

  /**
   * 调用 Coze API
   */
  private async invokeCoze(
    messages: LLMMessage[],
    options: LLMOptions & { model: string }
  ): Promise<LLMResponse> {
    // Coze 使用官方 SDK
    const { LLMClient, Config } = await import('coze-coding-dev-sdk');
    
    const config = new Config({
      apiKey: this.apiKey,
      timeout: 30000,
    });

    const client = new LLMClient(config);

    const response = await client.invoke(
      messages.map(m => ({ role: m.role, content: m.content })),
      {
        temperature: options.temperature || 0.3,
        model: options.model,
      }
    );

    return {
      content: response.content || '',
      model: options.model,
    };
  }

  /**
   * 调用 DeepSeek API
   */
  private async invokeDeepSeek(
    messages: LLMMessage[],
    options: LLMOptions & { model: string }
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: messages,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP,
        max_tokens: options.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * 调用通义千问 API
   */
  private async invokeQwen(
    messages: LLMMessage[],
    options: LLMOptions & { model: string }
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: messages,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP,
        max_tokens: options.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Qwen API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * 调用 Gemini API
   */
  private async invokeGemini(
    messages: LLMMessage[],
    options: LLMOptions & { model: string }
  ): Promise<LLMResponse> {
    // Gemini 使用不同的 API 格式
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch(
      `${this.provider.baseUrl}/models/${options.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: userMessages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          systemInstruction: systemInstruction ? {
            parts: [{ text: systemInstruction }],
          } : undefined,
          generationConfig: {
            temperature: options.temperature ?? 0.3,
            topP: options.topP,
            maxOutputTokens: options.maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.candidates[0].content.parts[0].text,
      model: options.model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }

  /**
   * 调用 OpenAI API
   */
  private async invokeOpenAI(
    messages: LLMMessage[],
    options: LLMOptions & { model: string }
  ): Promise<LLMResponse> {
    const response = await fetch(`${this.provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: messages,
        temperature: options.temperature ?? 0.3,
        top_p: options.topP,
        max_tokens: options.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * 验证 API Key
   */
  async validate(): Promise<boolean> {
    try {
      await this.invoke(
        [
          { role: 'system', content: '你是一个测试助手' },
          { role: 'user', content: '回复"OK"' },
        ],
        {}
      );
      return true;
    } catch (error) {
      console.error('API Key validation failed:', error);
      return false;
    }
  }
}

/**
 * 创建 LLM 服务实例
 */
export function createLLMService(modelId: string, apiKey: string): LLMService {
  return new LLMService(modelId, apiKey);
}
