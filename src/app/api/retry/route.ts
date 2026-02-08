import { NextRequest, NextResponse } from 'next/server';
import { createLLMService } from '@/lib/llm-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

function parseDiseases(response: string): string[] {
  const cleanedResponse = response.trim();

  // 检查是否为"未识别到病种"
  if (cleanedResponse === '未识别到病种' || cleanedResponse.includes('未识别到')) {
    return [];
  }

  // 尝试提取方括号中的内容
  const bracketMatch = cleanedResponse.match(/\[(.*)\]/);
  if (bracketMatch) {
    const diseases = bracketMatch[1]
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    return diseases;
  }

  // 如果没有方括号，尝试直接解析
  // 移除可能的序号前缀
  const withoutPrefix = cleanedResponse.replace(/^\d+[\.\、]\s*/, '');

  // 按逗号、顿号、分号等分隔符分割
  const diseases = withoutPrefix
    .split(/[,，、;；]/)
    .map(d => d.trim())
    .filter(d => d.length > 0 && !d.includes('未识别') && !d.includes('无'));

  return diseases;
}

export async function POST(request: NextRequest) {
  try {
    const { text, systemPrompt, userPrompt, modelId, apiKey } = await request.json();

    if (!text) {
      return NextResponse.json(
        {
          error: '缺少文本内容',
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

    // 使用配置的模型或默认模型
    const actualModelId = modelId || 'coze/deepseek-v3-2-251201';
    
    // 创建 LLM 服务
    const llmService = createLLMService(actualModelId, apiKey);

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
            temperature: 0.3,
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
