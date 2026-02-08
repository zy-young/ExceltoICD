import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, systemPrompt, userPrompt } = body;

    if (!text) {
      return NextResponse.json(
        { error: '缺少文本内容' },
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

输出格式要求：
- 直接输出识别到的病种列表
- 格式：[病种1, 病种2, ...]
- 如果没有病种：未识别到病种
- 不要输出任何解释或其他文字
- 不要使用 markdown 格式`;

    // 构建用户提示词
    let finalUserPrompt = `请分析以下文本，提取其中的病种名称：

文本：${text}`;
    
    // 如果用户提供了自定义提示词，追加到后面
    if (userPrompt && userPrompt.trim()) {
      finalUserPrompt += `\n\n额外要求：${userPrompt}`;
    }

    const config = new Config();
    const client = new LLMClient(config);

    // 重试机制（最多5次）
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 1000;
    let lastError: Error | null = null;
    let fullResponse = '';
    
    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        // 使用非流式调用，设置15秒超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
          const response = await client.invoke(
            [
              { role: 'system', content: finalSystemPrompt },
              { role: 'user', content: finalUserPrompt },
            ],
            { 
              temperature: 0.3, 
              model: 'deepseek-v3-2-251201'
            }
          );
          
          fullResponse = response.content || '';
          
          // 成功获取响应，跳出重试循环
          lastError = null;
          break;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error as Error;
        console.error(`第 ${retry + 1} 次尝试失败:`, error);
        
        // 如果不是最后一次重试，等待后继续
        if (retry < MAX_RETRIES) {
          await delay(RETRY_DELAY);
        }
      }
    }

    if (lastError) {
      return NextResponse.json(
        { 
          error: `重试失败（已尝试 ${MAX_RETRIES} 次）`,
          details: lastError.message 
        },
        { status: 500 }
      );
    }

    // 解析结果
    const diseases = parseDiseases(fullResponse);

    return NextResponse.json({
      success: true,
      diseases: diseases,
      rawResponse: fullResponse
    });

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
