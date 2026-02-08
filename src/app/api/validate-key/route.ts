import { NextRequest, NextResponse } from 'next/server';
import { createLLMService } from '@/lib/llm-service';
import { getProviderInfo } from '@/lib/model-providers';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { apiKey, modelId } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: 'API Key 不能为空' },
        { status: 400 }
      );
    }

    // 默认使用 coze/deepseek-v3-2-251201
    const actualModelId = modelId || 'coze/deepseek-v3-2-251201';

    // 检查 API Key 基本格式（至少应该有 20 个字符）
    if (apiKey.length < 20) {
      return NextResponse.json({
        success: false,
        message: 'API Key 长度太短，请检查是否正确复制'
      }, { status: 400 });
    }

    // 验证模型 ID 格式
    const providerId = actualModelId.split('/')[0];
    const provider = getProviderInfo(providerId);
    
    if (!provider) {
      return NextResponse.json({
        success: false,
        message: `不支持的模型提供商: ${providerId}`
      }, { status: 400 });
    }

    // 创建 LLM 服务并验证
    const llmService = createLLMService(actualModelId, apiKey);

    try {
      const isValid = await llmService.validate();

      if (isValid) {
        return NextResponse.json({
          success: true,
          message: 'API Key 验证成功',
          provider: provider.name,
          model: actualModelId
        });
      } else {
        return NextResponse.json({
          success: false,
          message: 'API Key 无效，请检查'
        }, { status: 401 });
      }
    } catch (error: any) {
      console.error('API Key 验证失败:', error);
      
      const errorMessage = error?.message || '未知错误';
      
      // 根据不同的错误类型返回友好的提示
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('API key') || errorMessage.includes('invalid')) {
        return NextResponse.json({
          success: false,
          message: 'API Key 无效或无权限，请检查 API Key 是否正确'
        }, { status: 401 });
      } else if (errorMessage.includes('quota') || errorMessage.includes('limit') || errorMessage.includes('429')) {
        return NextResponse.json({
          success: false,
          message: 'API Key 的配额已用完或超出限制，请检查账户状态'
        }, { status: 429 });
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        return NextResponse.json({
          success: false,
          message: 'API 请求超时，请检查网络连接'
        }, { status: 504 });
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
        return NextResponse.json({
          success: false,
          message: '网络连接失败，请检查网络'
        }, { status: 503 });
      } else {
        return NextResponse.json({
          success: false,
          message: `验证失败: ${errorMessage}`
        }, { status: 500 });
      }
    }
  } catch (error: any) {
    console.error('验证 API Key 时发生错误:', error);
    return NextResponse.json(
      {
        success: false,
        message: `服务器错误: ${error?.message || '未知错误'}`
      },
      { status: 500 }
    );
  }
}
