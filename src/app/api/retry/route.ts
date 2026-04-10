import { NextRequest, NextResponse } from 'next/server';
import { createLLMService } from '@/lib/llm-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

function parseDiseases(response: string): string[] {
  // 去掉可能的破折号/星号前缀（如 "- null" 或 "* null"）
  const cleanedResponse = response.trim().replace(/^[-*]\s*/, '');

  // 检查是否为 null（模糊无法识别）
  if (cleanedResponse.toLowerCase() === 'null' || cleanedResponse.toLowerCase() === '[null]') {
    return ['null'];
  }

  // 检查是否为"未识别到病种"
  if (cleanedResponse === '未识别到病种' || cleanedResponse.includes('未识别到')) {
    return [];
  }

  // 尝试提取方括号中的内容
  const bracketMatch = cleanedResponse.match(/\[(.*)\]/s);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    if (inner === '') return [];
    const diseases = inner
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    return diseases;
  }

  // 如果没有方括号，尝试直接解析
  const withoutPrefix = cleanedResponse.replace(/^\d+[\.\、]\s*/, '');

  const diseases = withoutPrefix
    .split(/[,，、;；]/)
    .map(d => d.trim())
    .filter(d => d.length > 0 && !d.includes('未识别') && !d.includes('无'));

  return diseases;
}

interface RetryRequestBody {
  text?: string;
  systemPrompt?: string;
  userPrompt?: string;
  apiKey?: string;
  modelId?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RetryRequestBody;
    const { text, systemPrompt, userPrompt } = body;

    if (!text) {
      return NextResponse.json(
        {
          error: '缺少文本内容',
        },
        { status: 400 }
      );
    }

    // 从 localStorage 读取配置（前端会传递）
    const apiKey = body.apiKey || '';
    const modelId = body.modelId || body.model || 'coze/deepseek-v3-2-251201';
    const llmTemperature = body.temperature ?? 0.3;
    const llmTopP = body.topP;
    const llmMaxTokens = body.maxTokens || undefined;
    const llmFrequencyPenalty = body.frequencyPenalty;
    const llmPresencePenalty = body.presencePenalty;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: '缺少 API Key',
        },
        { status: 400 }
      );
    }

    // 使用自定义系统提示词或默认提示词
    const finalSystemPrompt = systemPrompt || `你是一个专业的医疗文本分析助手，专门从文本中识别和提取病种名称。

规则：
1. 仔细分析文本，识别其中提到的所有疾病、病症、病种名称
2. 只提取明确的病种名称，不要包含症状描述或治疗方式
3. 病种可以是通用疾病名称（如"高血压"、"糖尿病"）或特定病种（如"阿尔茨海默病"）
4. 如果文本中没有病种信息，返回"未识别到病种"
5. 使用标准医学术语

输出格式：
- 直接输出病种名称列表
- 格式：[病种1, 病种2, ...]
- 无病种：未识别到病种
- 不要输出其他内容`;

    let finalUserPrompt = `请分析以下文本，提取其中的病种名称：

文本：${text}`;

    if (userPrompt && userPrompt.trim()) {
      finalUserPrompt += `\n\n额外要求：${userPrompt}`;
    }

    // 创建 LLM 服务
    const llmService = createLLMService(modelId, apiKey);

    // 重试逻辑
    let lastError: Error | null = null;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        const response = await llmService.invoke(
          [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: finalUserPrompt },
          ],
          {
            temperature: llmTemperature,
            topP: llmTopP,
            maxTokens: llmMaxTokens,
            frequencyPenalty: llmFrequencyPenalty,
            presencePenalty: llmPresencePenalty,
          }
        );

        // 解析结果
        const diseases = parseDiseases(response.content);

        return NextResponse.json({
          success: true,
          diseases: diseases,
          rawResponse: response.content,
          model: response.model,
          usage: response.usage,
        });
      } catch (error) {
        lastError = error as Error;

        if (retry < MAX_RETRIES) {
          await delay(RETRY_DELAY);
        }
      }
    }

    if (lastError) {
      return NextResponse.json(
        {
          error: `重试失败（已尝试 ${MAX_RETRIES + 1} 次）`,
          details: lastError.message
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('重试接口错误:', error);
    return NextResponse.json(
      {
        error: '重试失败',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
