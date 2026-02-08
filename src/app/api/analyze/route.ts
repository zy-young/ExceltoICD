import { NextRequest } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';
import * as XLSX from 'xlsx';
import { writeFile, readFile, unlink, appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 7200; // 增加到120分钟（2小时）

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;
const SAVE_INTERVAL = 100; // 每100条保存一次
const LLM_CALL_TIMEOUT = 15000; // 15秒超时
const CONCURRENT_BATCH_SIZE = 20; // 并发处理数量（一次处理20条）
const LLM_MODEL = 'deepseek-v3-2-251201'; // LLM模型

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
  const logDir = '/app/work/logs/bypass';
  try {
    await mkdir(logDir, { recursive: true });
  } catch (error) {
    // 忽略目录已存在的错误
  }
  
  const logFilePath = join(logDir, `analysis-${fileId}.log`);
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

// 保存结果到Excel文件（每100条一个文件）
const saveResultsToExcel = async (results: any[], batchNumber: number, fileId: string) => {
  const outputDir = '/tmp/excel-exports';
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    // 忽略目录已存在的错误
  }
  
  const headers = ['序号', '原始文本', '识别到的病种', '状态'];
  const rows = results.map((r: any, index: number) => [
    index + 1,
    `"${r.originalText.replace(/"/g, '""')}"`,
    `"${(r.diseases || []).join('; ')}"`,
    r.error ? `失败: ${r.error}` : '成功'
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = Buffer.from(csvContent, 'utf-8');
  
  const fileName = `batch-${batchNumber}-${fileId}.csv`;
  const filePath = join(outputDir, fileName);
  await writeFile(filePath, blob);
  
  return fileName;
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
        });

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
        let existingStats = { successCount: 0, failureCount: 0, totalDiseases: 0 };
        
        if (resumeFromIndex > 0) {
          const tempData = await loadTempFile(fileId);
          if (tempData) {
            // 兼容旧格式：如果包含results，从中提取统计信息
            if (tempData.results && tempData.results.length > 0) {
              existingResults = tempData.results;
              existingStats.successCount = existingResults.filter((r: any) => !r.error).length;
              existingStats.failureCount = existingResults.filter((r: any) => r.error).length;
              existingStats.totalDiseases = existingResults.reduce((sum: number, r: any) => sum + (r.diseases?.length || 0), 0);
            } else if (tempData.savedFiles && tempData.savedFiles.length > 0) {
              // 新格式：只保存进度和统计信息
              existingStats.successCount = tempData.successCount || 0;
              existingStats.failureCount = tempData.failureCount || 0;
              existingStats.totalDiseases = tempData.totalDiseases || 0;
            }
            
            await logToFile(fileId, LogLevel.INFO, '从临时文件恢复数据', { 
              existingResultsCount: existingResults.length,
              resumeFromIndex,
              stats: existingStats
            }, controller);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'resume', 
              count: existingResults.length,
              message: `已从第 ${resumeFromIndex + 1} 条继续处理` 
            })}\n\n`));
          }
        }

        const config = new Config({ timeout: 30000 });
        const client = new LLMClient(config);
        await logToFile(fileId, LogLevel.INFO, 'LLM客户端初始化完成', { 
          timeout: 30000,
          model: 'deepseek-v3-2-251201'
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
        
        // 添加统计计数器，避免在最后遍历大型results数组
        let successCount = existingStats.successCount;
        let failureCount = existingStats.failureCount;
        let totalDiseases = existingStats.totalDiseases;
        
        let currentBatch: any[] = [];
        let batchNumber = Math.floor(processedCount / SAVE_INTERVAL) + 1;
        let savedFiles: string[] = [];

        // 处理单个文本的函数
        const processSingleText = async (text: string, index: number, userPrompt?: string) => {
          const itemStartTime = Date.now();
          
          try {
            let finalUserPrompt = `请分析以下文本，提取其中的病种名称：

文本：${text}`;
            
            if (userPrompt && userPrompt.trim()) {
              finalUserPrompt += `\n\n额外要求：${userPrompt}`;
            }

            let lastError: Error | null = null;
            let fullResponse = '';
            const retryHistory: any[] = [];
            
            // 注释掉DEBUG日志以减少IO操作，提升性能
            // await logToFile(fileId, LogLevel.DEBUG, `开始处理第 ${index + 1} 条数据`, {
            //   textPreview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            //   textLength: text.length
            // }, controller);
            
            for (let retry = 0; retry <= MAX_RETRIES; retry++) {
              try {
                // 只在重试时记录日志，成功时不记录
                if (retry > 0) {
                  await logToFile(fileId, LogLevel.INFO, `第 ${index + 1} 条数据 - 第 ${retry + 1} 次尝试`, {
                    retryAttempt: retry + 1,
                    maxRetries: MAX_RETRIES + 1
                  }, controller);
                }
                
                const llmCallStart = Date.now();
                
                try {
                  // 使用非流式invoke调用
                  const response = await client.invoke(
                    [
                      { role: 'system', content: finalSystemPrompt },
                      { role: 'user', content: finalUserPrompt },
                    ],
                    { 
                      temperature: 0.3, 
                      model: LLM_MODEL
                    }
                  );
                  
                  fullResponse = response.content || '';
                  
                  // 只在第一次成功时记录日志，避免大量日志
                  if (retry === 0) {
                    const llmCallDuration = Date.now() - llmCallStart;
                    // 注释掉每条数据的成功日志，减少IO操作
                    // await logToFile(fileId, LogLevel.INFO, `第 ${index + 1} 条数据 - 第 ${retry + 1} 次尝试成功`, {
                    //   duration: llmCallDuration,
                    //   responseLength: fullResponse.length
                    // }, controller);
                  }
                  
                  lastError = null;
                  break;
                } catch (error) {
                  const errorDetails = formatErrorDetails(error, retry);
                  retryHistory.push(errorDetails);
                  
                  await logToFile(fileId, LogLevel.WARN, `第 ${index + 1} 条数据 - 第 ${retry + 1} 次尝试失败`, {
                    errorType: errorDetails.errorType,
                    errorMessage: errorDetails.errorMessage,
                    retryAttempt: retry + 1,
                    willRetry: retry < MAX_RETRIES
                  }, controller);
                  
                  if (retry < MAX_RETRIES) {
                    await delay(RETRY_DELAY);
                  }
                }
              } catch (outerError) {
                lastError = outerError as Error;
                const errorDetails = formatErrorDetails(outerError, retry);
                retryHistory.push(errorDetails);
                
                await logToFile(fileId, LogLevel.WARN, `第 ${index + 1} 条数据 - 外层try块捕获异常`, {
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
              
              await logToFile(fileId, LogLevel.ERROR, `第 ${index + 1} 条数据处理失败（全部重试失败）`, {
                totalRetries: MAX_RETRIES + 1,
                processingTime,
                errorType: errorDetails.errorType,
                errorMessage: errorDetails.errorMessage,
                retryHistorySummary: retryHistory.map(h => ({
                  attempt: h.retryAttempt,
                  errorType: h.errorType,
                  errorMessage: h.errorMessage
                }))
              }, controller);
              
              const errorData = {
                type: 'result',
                index: index + 1,
                originalText: text,
                diseases: [],
                error: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
                errorType: errorDetails.errorType,
                retryable: true,
                processingTime: processingTime,
                processingTimeFormatted: formatDuration(processingTime)
              };
              
              return errorData;
            } else {
              const diseases = parseDiseases(fullResponse);
              
              await logToFile(fileId, LogLevel.INFO, `第 ${index + 1} 条数据处理成功`, {
                processingTime: Date.now() - itemStartTime,
                diseasesCount: diseases.length,
                diseases: diseases.length > 0 ? diseases : '无病种'
              }, controller);

              const processingTime = Date.now() - itemStartTime;

              const resultData = {
                type: 'result',
                index: index + 1,
                originalText: text,
                diseases: diseases,
                processingTime: processingTime,
                processingTimeFormatted: formatDuration(processingTime)
              };
              
              return resultData;
            }
          } catch (error) {
            console.error(`处理第 ${index + 1} 条数据失败:`, error);
            const processingTime = Date.now() - itemStartTime;
            const errorDetails = formatErrorDetails(error, 0);
            
            await logToFile(fileId, LogLevel.ERROR, `第 ${index + 1} 条数据处理失败（外层异常）`, {
              errorType: errorDetails.errorType,
              errorMessage: errorDetails.errorMessage,
              processingTime
            }, controller);
            
            const errorData = {
              type: 'result',
              index: index + 1,
              originalText: text,
              diseases: [],
              error: `${errorDetails.errorType}: ${errorDetails.errorMessage}`,
              errorType: errorDetails.errorType,
              retryable: false,
              processingTime: processingTime,
              processingTimeFormatted: formatDuration(processingTime)
            };
            
            return errorData;
          }
        };

        // 并发处理数据：分批处理，每批 CONCURRENT_BATCH_SIZE 条
        const HEARTBEAT_BATCH_INTERVAL = 5; // 每5个批次（100条）发送一次心跳，减少网络IO
        let batchCount = 0; // 批次计数器
        
        for (let batchStart = resumeFromIndex; batchStart < texts.length; batchStart += CONCURRENT_BATCH_SIZE) {
          batchCount++;
          const batchEnd = Math.min(batchStart + CONCURRENT_BATCH_SIZE, texts.length);
          const batchTexts = texts.slice(batchStart, batchEnd);
          
          // 并发处理当前批次
          const batchPromises = batchTexts.map((text, batchIndex) => 
            processSingleText(text, batchStart + batchIndex, userPrompt)
          );
          
          const batchResults = await Promise.all(batchPromises);
          
          // 处理结果
          for (const result of batchResults) {
            // 更新统计计数器
            if (!('error' in result) || !result.error) {
              successCount++;
              totalDiseases += (result.diseases?.length || 0);
            } else {
              failureCount++;
            }
            
            results.push(result);
            currentBatch.push(result);
            processedCount++;
            
            // 立即发送结果给前端
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(result)}\n\n`));
          }

          // 每100条保存一次Excel
          if (processedCount % SAVE_INTERVAL === 0) {
            await logToFile(fileId, LogLevel.INFO, `保存第 ${batchNumber} 批数据`, {
              batchSize: currentBatch.length,
              totalProcessed: processedCount
            }, controller);
            
            const fileName = await saveResultsToExcel(currentBatch, batchNumber, fileId);
            savedFiles.push(fileName);
            currentBatch = [];
            batchNumber++;
            
            // 保存临时文件：只保存进度信息，不保存完整results，避免内存和IO问题
            await saveTempFile(fileId, { processedCount, savedFiles, successCount, failureCount, totalDiseases });
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'saved', 
              count: processedCount,
              batchFile: fileName
            })}\n\n`));
            
            // 定期清空results数组以节省内存（每100条清空一次）
            // 结果已经通过SSE发送给前端并保存到CSV文件，不再需要在内存中保留
            results.length = 0;
          }
          
          // 每5个批次（100条）发送一次心跳保活，减少网络IO
          if (batchCount % HEARTBEAT_BATCH_INTERVAL === 0) {
          const heartbeatData = {
            type: 'heartbeat',
            timestamp: Date.now(),
            processed: processedCount
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(heartbeatData)}\n\n`));
          }
          
          // 每100条发送一次进度更新，减少网络IO
          if (processedCount % SAVE_INTERVAL === 0) {
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
          }
        }

        // 保存最后一批数据
        if (currentBatch.length > 0) {
          await logToFile(fileId, LogLevel.INFO, `保存最后一批数据`, {
            batchSize: currentBatch.length,
            batchNumber
          }, controller);
          
          const fileName = await saveResultsToExcel(currentBatch, batchNumber, fileId);
          savedFiles.push(fileName);
          currentBatch = [];
          
          // 保存最终临时文件，更新统计信息
          await saveTempFile(fileId, { processedCount, savedFiles, successCount, failureCount, totalDiseases });
        }

        const elapsed = Date.now() - startTime;
        
        // 使用已经维护的计数器，避免遍历大型results数组
        // const successCount = results.filter(r => !r.error).length;
        // const failureCount = results.filter(r => r.error).length;
        // const totalDiseases = results.reduce((sum, r) => sum + (r.diseases?.length || 0), 0);
        
        await logToFile(fileId, LogLevel.INFO, '分析完成', {
          totalProcessed: processedCount,
          totalExpected: texts.length,
          successCount,
          failureCount,
          successRate: ((successCount / processedCount) * 100).toFixed(2) + '%',
          totalDiseases,
          totalDuration: elapsed,
          avgProcessingTime: (elapsed / processedCount).toFixed(2) + 'ms',
          savedBatches: savedFiles.length
        }, controller);
        
        const completeData = {
          type: 'complete',
          processed: processedCount,
          total: texts.length,
          elapsed: elapsed,
          elapsedFormatted: formatDuration(elapsed),
          savedFiles: savedFiles
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeData)}\n\n`));
        
        await deleteTempFile(fileId);
        
        controller.close();

      } catch (error) {
        console.error('处理错误:', error);
        const errorDetails = formatErrorDetails(error, 0);
        
        try {
          await logToFile(fileId || 'unknown', LogLevel.ERROR, '处理发生严重错误', {
            errorType: errorDetails.errorType,
            errorMessage: errorDetails.errorMessage,
            processedCount: processedCount || 0,
            totalRows: texts?.length || 0
          });
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
