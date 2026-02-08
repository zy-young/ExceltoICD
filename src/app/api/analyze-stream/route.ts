import { NextRequest } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';
import * as XLSX from 'xlsx';
import { writeFile, readFile, unlink, appendFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 900;

const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;
const SAVE_INTERVAL = 100;
const LLM_CALL_TIMEOUT = 15000; // 15秒超时

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带超时的Promise
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    )
  ]);
};

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}天${hours % 24}小时`;
  } else if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
};

enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG'
}

enum ErrorType {
  EXCEL_READ = 'EXCEL_READ',
  LLM_CALL = 'LLM_CALL',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  RESPONSE_PARSE = 'RESPONSE_PARSE',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN'
}

const logToFile = async (
  fileId: string,
  level: LogLevel,
  message: string,
  details?: any,
  controller?: ReadableStreamDefaultController<any>
) => {
  const logFilePath = join('/app/work/logs/bypass', `analysis-${fileId}.log`);
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...(details && { details })
  };
  
  try {
    await appendFile(logFilePath, JSON.stringify(logEntry) + '\n', 'utf-8');
  } catch (error) {
    console.error('写入日志文件失败:', error);
  }
  
  if (controller) {
    try {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
        type: 'log',
        level,
        message,
        timestamp,
        ...(details && { details })
      })}\n\n`));
    } catch (error) {
      console.error('发送日志到前端失败:', error);
    }
  }
  
  const consoleMessage = `[${timestamp}] [${level}] ${message}`;
  if (level === LogLevel.ERROR) {
    console.error(consoleMessage, details || '');
  } else if (level === LogLevel.WARN) {
    console.warn(consoleMessage, details || '');
  } else {
    console.log(consoleMessage, details || '');
  }
};

const classifyError = (error: any): ErrorType => {
  const errorMessage = error?.message || '';
  
  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    return ErrorType.LLM_TIMEOUT;
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
    return ErrorType.NETWORK;
  }
  
  if (errorMessage.includes('parse') || errorMessage.includes('JSON')) {
    return ErrorType.RESPONSE_PARSE;
  }
  
  if (errorMessage.includes('API') || errorMessage.includes('LLM') || errorMessage.includes('model')) {
    return ErrorType.LLM_CALL;
  }
  
  return ErrorType.UNKNOWN;
};

const formatErrorDetails = (error: any, retryCount: number = 0): any => {
  return {
    errorType: classifyError(error),
    errorMessage: error?.message || 'Unknown error',
    errorName: error?.name || 'Unknown',
    retryAttempt: retryCount + 1,
    stack: error?.stack ? error.stack.split('\n').slice(0, 3).join('\n') : undefined,
    ...(error?.code && { errorCode: error.code }),
    ...(error?.statusCode && { statusCode: error.statusCode })
  };
};

const getTempFilePath = (fileId: string) => join('/tmp', `disease-extraction-${fileId}.json`);

const saveTempFile = async (fileId: string, data: any) => {
  const filePath = getTempFilePath(fileId);
  await writeFile(filePath, JSON.stringify(data), 'utf-8');
};

const loadTempFile = async (fileId: string) => {
  const filePath = getTempFilePath(fileId);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('读取临时文件失败:', error);
    return null;
  }
};

const deleteTempFile = async (fileId: string) => {
  const filePath = getTempFilePath(fileId);
  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch (error) {
    console.error('删除临时文件失败:', error);
  }
};

function parseDiseases(response: string): string[] {
  const cleanedResponse = response.trim();
  
  if (cleanedResponse === '未识别到病种' || cleanedResponse.includes('未识别到')) {
    return [];
  }

  const bracketMatch = cleanedResponse.match(/\[(.*)\]/);
  if (bracketMatch) {
    const diseases = bracketMatch[1]
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    return diseases;
  }

  const withoutPrefix = cleanedResponse.replace(/^\d+[\.\、]\s*/, '');
  
  const diseases = withoutPrefix
    .split(/[,，、;；]/)
    .map(d => d.trim())
    .filter(d => d.length > 0 && !d.includes('未识别') && !d.includes('无'));

  return diseases;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // 声明变量在try块之外，以便catch块可以访问
      let fileId: string = 'unknown';
      let processedCount: number = 0;
      let texts: string[] = [];
      
      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const column = formData.get('column') as string;
        const systemPrompt = formData.get('systemPrompt') as string;
        const userPrompt = formData.get('userPrompt') as string;
        const resumeFromIndex = parseInt(formData.get('resumeFrom') as string || '0');
        fileId = formData.get('fileId') as string || Date.now().toString();

        if (!file || !column) {
          const errorData = { type: 'error', message: '缺少文件或列名' };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', fileId })}\n\n`));

        await logToFile(fileId, LogLevel.INFO, '开始分析', {
          totalRowsExpected: 'unknown',
          resumeFromIndex
        }, controller);

        await logToFile(fileId, LogLevel.INFO, '开始读取Excel文件', { fileName: file.name }, controller);
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
        
        await logToFile(fileId, LogLevel.INFO, 'Excel文件读取成功', { 
          sheetName, 
          totalRows: jsonData.length 
        }, controller);

        if (jsonData.length < 2) {
          const errorData = { type: 'error', message: 'Excel 文件为空或格式不正确' };
          await logToFile(fileId, LogLevel.ERROR, 'Excel文件为空或格式不正确', { rows: jsonData.length }, controller);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        const headers = jsonData[0];
        const columnIndex = headers.indexOf(column);

        if (columnIndex === -1) {
          const errorData = { type: 'error', message: `未找到列名: ${column}` };
          await logToFile(fileId, LogLevel.ERROR, '未找到指定列', { column, headers }, controller);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        await logToFile(fileId, LogLevel.INFO, '开始提取数据', { column, columnIndex }, controller);
        texts = jsonData.slice(1)
          .map(row => row[columnIndex]?.toString() || '')
          .filter(text => text.trim());
        
        await logToFile(fileId, LogLevel.INFO, '数据提取完成', { 
          totalRows: texts.length,
          emptyRows: jsonData.length - 1 - texts.length 
        }, controller);

        if (texts.length === 0) {
          const errorData = { type: 'error', message: '指定列没有有效数据' };
          await logToFile(fileId, LogLevel.ERROR, '指定列没有有效数据', { column }, controller);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'total', count: texts.length })}\n\n`));

        let existingResults: any[] = [];
        if (resumeFromIndex > 0) {
          const tempData = await loadTempFile(fileId);
          if (tempData && tempData.results) {
            existingResults = tempData.results;
            await logToFile(fileId, LogLevel.INFO, '从临时文件恢复数据', { 
              existingResultsCount: existingResults.length,
              resumeFromIndex 
            }, controller);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'resume', 
              count: existingResults.length,
              message: `已从第 ${resumeFromIndex + 1} 条继续处理` 
            })}\n\n`));
          }
        }

        const config = new Config({ timeout: 86400000 });
        const client = new LLMClient(config);
        await logToFile(fileId, LogLevel.INFO, 'LLM客户端初始化完成', { 
          timeout: 86400000,
          model: 'doubao-seed-1-8-251228'
        }, controller);

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

        const startTime = Date.now();
        processedCount = existingResults.length;
        const results = [...existingResults];

        for (let i = resumeFromIndex; i < texts.length; i++) {
          const itemStartTime = Date.now();
          
          try {
            const text = texts[i];
            
            let finalUserPrompt = `请分析以下文本，提取其中的病种名称：

文本：${text}`;
            
            if (userPrompt && userPrompt.trim()) {
              finalUserPrompt += `\n\n额外要求：${userPrompt}`;
            }

            let lastError: Error | null = null;
            let fullResponse = '';
            const retryHistory: any[] = [];
            
            await logToFile(fileId, LogLevel.DEBUG, `开始处理第 ${i + 1} 条数据`, {
              textPreview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
              textLength: text.length
            }, controller);
            
            for (let retry = 0; retry <= MAX_RETRIES; retry++) {
              let abortController: AbortController | null = null;
              let timeoutTimer: NodeJS.Timeout | null = null;
              
              try {
                await logToFile(fileId, LogLevel.INFO, `第 ${i + 1} 条数据 - 第 ${retry + 1} 次尝试`, {
                  retryAttempt: retry + 1,
                  maxRetries: MAX_RETRIES + 1,
                  timeout: LLM_CALL_TIMEOUT
                }, controller);
                
                const llmCallStart = Date.now();
                abortController = new AbortController();
                
                await logToFile(fileId, LogLevel.DEBUG, `第 ${i + 1} 条数据 - 第 ${retry + 1} 次尝试开始LLM调用`, {
                  startTime: new Date(llmCallStart).toISOString()
                }, controller);
                
                // 创建超时定时器（备用）
                timeoutTimer = setTimeout(() => {
                  if (abortController && !abortController.signal.aborted) {
                    abortController.abort();
                    // 注意：这里不能使用await，因为这是在setTimeout回调中
                    console.warn(`[警告] 第 ${i + 1} 条数据 - 超时定时器触发 (${LLM_CALL_TIMEOUT}ms)`);
                  }
                }, LLM_CALL_TIMEOUT);
                
                try {
                  await logToFile(fileId, LogLevel.DEBUG, `第 ${i + 1} 条数据 - 正在进行非流式LLM调用`, {
                    elapsed: Date.now() - llmCallStart
                  }, controller);

                  // 使用非流式调用，设置15秒超时
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

                  // 清除超时定时器
                  if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                  }

                  const llmCallDuration = Date.now() - llmCallStart;
                  await logToFile(fileId, LogLevel.INFO, `第 ${i + 1} 条数据 - 第 ${retry + 1} 次尝试成功`, {
                    duration: llmCallDuration,
                    responseLength: fullResponse.length
                  }, controller);

                  lastError = null;
                  break;
                } catch (error) {
                  // 清除超时定时器
                  if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                  }
                  
                  lastError = error as Error;
                  const errorDetails = formatErrorDetails(error, retry);
                  retryHistory.push(errorDetails);
                  
                  await logToFile(fileId, LogLevel.WARN, `第 ${i + 1} 条数据 - 第 ${retry + 1} 次尝试失败`, {
                    errorType: errorDetails.errorType,
                    errorMessage: errorDetails.errorMessage,
                    retryAttempt: retry + 1,
                    willRetry: retry < MAX_RETRIES,
                    stack: error instanceof Error ? error.stack : undefined,
                    errorName: error instanceof Error ? error.name : 'Unknown',
                    errorCode: (error as any).code
                  }, controller);
                  
                  if (retry < MAX_RETRIES) {
                    await logToFile(fileId, LogLevel.INFO, `第 ${i + 1} 条数据 - 等待 ${RETRY_DELAY}ms 后重试`, {}, controller);
                    await delay(RETRY_DELAY);
                  } else {
                    await logToFile(fileId, LogLevel.ERROR, `第 ${i + 1} 条数据 - 已达最大重试次数`, {
                      maxRetries: MAX_RETRIES + 1,
                      totalAttempts: retry + 1,
                      lastError: errorDetails.errorMessage
                    }, controller);
                  }
                }
              } catch (outerError) {
                // 捕获外层try块的异常（第347行的try）
                lastError = outerError as Error;
                const errorDetails = formatErrorDetails(outerError, retry);
                retryHistory.push(errorDetails);
                
                await logToFile(fileId, LogLevel.WARN, `第 ${i + 1} 条数据 - 外层try块捕获异常`, {
                  errorType: errorDetails.errorType,
                  errorMessage: errorDetails.errorMessage,
                  retryAttempt: retry + 1
                }, controller);
                
                if (retry < MAX_RETRIES) {
                  await delay(RETRY_DELAY);
                }
              }
            }

            if (lastError) {
              const processingTime = Date.now() - itemStartTime;
              const errorDetails = formatErrorDetails(lastError, MAX_RETRIES);
              
              await logToFile(fileId, LogLevel.ERROR, `第 ${i + 1} 条数据处理失败（全部重试失败）`, {
                totalRetries: MAX_RETRIES + 1,
                processingTime,
                errorType: errorDetails.errorType,
                errorMessage: errorDetails.errorMessage,
                errorName: errorDetails.errorName,
                retryHistorySummary: retryHistory.map(h => ({
                  attempt: h.retryAttempt,
                  errorType: h.errorType,
                  errorMessage: h.errorMessage
                }))
              }, controller);
              
              const errorData = {
                type: 'result',
                index: i + 1,
                originalText: text,
                diseases: [],
                error: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
                errorType: errorDetails.errorType,
                errorDetails: errorDetails,
                retryable: true,
                processingTime: processingTime,
                processingTimeFormatted: formatDuration(processingTime)
              };
              results.push(errorData);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
              processedCount++;
              
              if (processedCount % 10 === 0) {
                const elapsed = Date.now() - startTime;
                const progressData = {
                  type: 'progress',
                  processed: processedCount,
                  total: texts.length,
                  percentage: Math.round((processedCount / texts.length) * 100),
                  elapsed: elapsed,
                  elapsedFormatted: formatDuration(elapsed)
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`));
                
                if (processedCount % SAVE_INTERVAL === 0) {
                  await saveTempFile(fileId, { results, processedCount });
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'saved', 
                    count: processedCount 
                  })}\n\n`));
                }
              }
              continue;
            }

            const diseases = parseDiseases(fullResponse);
            
            await logToFile(fileId, LogLevel.INFO, `第 ${i + 1} 条数据处理成功`, {
              processingTime: Date.now() - itemStartTime,
              diseasesCount: diseases.length,
              diseases: diseases.length > 0 ? diseases : '无病种'
            }, controller);

            const processingTime = Date.now() - itemStartTime;

            const resultData = {
              type: 'result',
              index: i + 1,
              originalText: text,
              diseases: diseases,
              processingTime: processingTime,
              processingTimeFormatted: formatDuration(processingTime)
            };
            results.push(resultData);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));

            processedCount++;

            if (processedCount % 10 === 0) {
              const elapsed = Date.now() - startTime;
              const progressData = {
                type: 'progress',
                processed: processedCount,
                total: texts.length,
                percentage: Math.round((processedCount / texts.length) * 100),
                elapsed: elapsed,
                elapsedFormatted: formatDuration(elapsed)
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressData)}\n\n`));
              
              if (processedCount % SAVE_INTERVAL === 0) {
                await saveTempFile(fileId, { results, processedCount });
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'saved', 
                  count: processedCount 
                })}\n\n`));
              }
            }
          } catch (error) {
            console.error(`处理第 ${i + 1} 条数据失败:`, error);
            const processingTime = Date.now() - itemStartTime;
            const errorDetails = formatErrorDetails(error, 0);
            
            await logToFile(fileId, LogLevel.ERROR, `第 ${i + 1} 条数据处理失败（外层异常）`, {
              errorType: errorDetails.errorType,
              errorMessage: errorDetails.errorMessage,
              errorName: errorDetails.errorName,
              processingTime,
              stack: error instanceof Error ? error.stack : undefined,
              errorCode: (error as any).code
            }, controller);
            
            const errorData = {
              type: 'result',
              index: i + 1,
              originalText: texts[i],
              diseases: [],
              error: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
              errorType: errorDetails.errorType,
              errorDetails: errorDetails,
              retryable: false,
              processingTime: processingTime,
              processingTimeFormatted: formatDuration(processingTime)
            };
            results.push(errorData);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
            processedCount++;
          }
        }

        const elapsed = Date.now() - startTime;
        
        const successCount = results.filter(r => !r.error).length;
        const failureCount = results.filter(r => r.error).length;
        const totalDiseases = results.reduce((sum, r) => sum + (r.diseases?.length || 0), 0);
        
        await logToFile(fileId, LogLevel.INFO, '分析完成', {
          totalProcessed: processedCount,
          totalExpected: texts.length,
          successCount,
          failureCount,
          successRate: ((successCount / processedCount) * 100).toFixed(2) + '%',
          totalDiseases,
          totalDuration: elapsed,
          avgProcessingTime: (elapsed / processedCount).toFixed(2) + 'ms',
          logFilePath: `/app/work/logs/bypass/analysis-${fileId}.log`
        }, controller);
        
        const completeData = {
          type: 'complete',
          processed: processedCount,
          total: texts.length,
          elapsed: elapsed,
          elapsedFormatted: formatDuration(elapsed),
          logFile: `analysis-${fileId}.log`
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`));
        
        await deleteTempFile(fileId);
        
        controller.close();

      } catch (error) {
        console.error('流式处理错误:', error);
        const errorDetails = formatErrorDetails(error, 0);
        
        // 尝试记录错误日志（可能没有fileId，所以使用临时ID）
        try {
          // 直接使用变量，如果未定义会报运行时错误
          await logToFile(fileId || 'unknown', LogLevel.ERROR, '流式处理发生严重错误', {
            errorType: errorDetails.errorType,
            errorMessage: errorDetails.errorMessage,
            errorName: errorDetails.errorName,
            stack: error instanceof Error ? error.stack : undefined,
            errorCode: (error as any).code,
            processedCount: processedCount || 0,
            totalRows: texts?.length || 0
          }, controller);
        } catch (logError) {
          console.error('记录错误日志失败:', logError);
        }
        
        const errorData = { 
          type: 'error', 
          message: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
          errorType: errorDetails.errorType,
          processedCount: processedCount || 0
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}
